import json
import logging
import asyncio
import anthropic
from app.config import settings

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """당신은 사이버 보안 뉴스 분석가입니다.
주어진 뉴스 기사를 분석하여 JSON 형식으로 정보를 추출합니다.
모든 텍스트 출력은 반드시 한국어로 작성하세요."""

USER_PROMPT_TEMPLATE = """다음 보안 뉴스 기사를 분석하고 JSON으로 응답하세요.

제목: {title}

다음 형식으로만 응답하세요 (다른 텍스트 없이):
{{
  "summary_title": "한 줄 요약 제목 (50자 이내, 한국어)",
  "summary_what": "무슨 일이 있었는지 설명 (3~5문장, 한국어)",
  "summary_impact": "어떤 피해나 영향이 발생했는지 (2~3문장, 한국어)",
  "threat_level": 위협_레벨_숫자,
  "country_codes": ["ISO_코드1", "ISO_코드2"],
  "attacker_codes": ["공격자_국가_ISO_코드"],
  "victim_codes": ["피해자_국가_ISO_코드"]
}}

위협 레벨 기준:
- 0: 보안과 무관하거나 경미한 일반 정보
- 1: 보안 패치 권고, 취약점 발견, 경미한 피싱
- 2: 소규모 해킹, 데이터 유출, 취약점 악용
- 3: 금융기관/기업 침해, 대규모 데이터 유출
- 4: 국가기반시설 공격, 사이버전, 대규모 랜섬웨어

country_codes: 사건과 직접 관련된 모든 국가 ISO 3166-1 alpha-2 코드.
attacker_codes: 공격을 수행한 것으로 귀속된 국가만 (확인된 경우). 불명이면 [].
victim_codes: 공격의 피해를 입은 국가들. 불명이면 [].
국가를 특정할 수 없으면 각 배열에 빈 배열 []을 반환하세요."""


_REPLACEMENT_CHAR = "�"


_KO_FIELDS = {"summary_title", "summary_what", "summary_impact"}

def _has_replacement_char(data: dict) -> bool:
    """한국어 필드에만 U+FFFD(깨진 문자) 여부 확인."""
    for k, v in data.items():
        if k in _KO_FIELDS and isinstance(v, str) and _REPLACEMENT_CHAR in v:
            return True
    return False


async def summarize_article(title: str, max_retries: int = 3) -> tuple[dict | None, dict]:
    """Returns (result, token_usage). token_usage = {"input": 0, "output": 0} on failure.

    Claude Haiku 모델이 한글 생성 시 간헐적으로 U+FFFD(replacement character)를 반환하는
    버그가 있으므로, 감지되면 최대 max_retries 회 재시도합니다.
    """
    zero_usage = {"input": 0, "output": 0}

    if not settings.claude_api_key:
        logger.warning("CLAUDE_API_KEY not set, skipping summarization")
        return None, zero_usage

    client = anthropic.AsyncAnthropic(api_key=settings.claude_api_key)
    total_usage = {"input": 0, "output": 0}

    for attempt in range(1, max_retries + 1):
        try:
            message = await client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=512,
                system=SYSTEM_PROMPT,
                messages=[
                    {"role": "user", "content": USER_PROMPT_TEMPLATE.format(title=title[:500])}
                ],
            )
            total_usage["input"] += message.usage.input_tokens
            total_usage["output"] += message.usage.output_tokens

            raw = message.content[0].text.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]

            result = json.loads(raw)

            if _has_replacement_char(result):
                logger.warning(
                    f"U+FFFD detected in Claude response (attempt {attempt}/{max_retries}): {title[:60]}"
                )
                if attempt < max_retries:
                    await asyncio.sleep(0.5)
                    continue
                else:
                    logger.error(f"All {max_retries} attempts returned garbled text, giving up: {title[:60]}")
                    return None, total_usage

            return result, total_usage

        except json.JSONDecodeError:
            logger.error(f"JSON parse failed for title (attempt {attempt}): {title[:80]}")
            if attempt >= max_retries:
                return None, total_usage
        except Exception as e:
            logger.error(f"Claude API error: {e}")
            return None, total_usage

    return None, total_usage


async def summarize_batch(articles: list[dict], concurrency: int = 2) -> tuple[list[dict], dict]:
    """Returns (processed_articles, total_token_usage).
    concurrency=2: 429 rate limit 방지를 위해 동시 요청 수 제한."""
    semaphore = asyncio.Semaphore(concurrency)
    total_tokens = {"input": 0, "output": 0}

    async def _process(article: dict) -> dict:
        async with semaphore:
            await asyncio.sleep(0.3)  # 요청 간 최소 간격으로 rate limit 완화
            result, usage = await summarize_article(article.get("source_title", ""))
            total_tokens["input"] += usage["input"]
            total_tokens["output"] += usage["output"]
            if result:
                article.update(result)
                article["ai_processed"] = True
            else:
                article["threat_level"] = 0
                article["country_codes"] = []
                article["ai_processed"] = False
            return article

    tasks = [_process(a) for a in articles]
    processed = await asyncio.gather(*tasks)
    return list(processed), total_tokens
