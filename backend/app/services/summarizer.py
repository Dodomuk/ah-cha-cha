from typing import Optional
import json
import logging
import asyncio
import anthropic
from app.config import settings

logger = logging.getLogger(__name__)


def _is_korean(text: str) -> bool:
    """텍스트에 한국어가 포함되어 있는지 확인."""
    if not text:
        return False
    for char in text:
        if ord(char) >= 0xAC00 and ord(char) <= 0xD7A3:  # 한글 범위
            return True
    return False


async def _translate_to_english(text: str) -> str:
    """한국어를 영어로 번역 (내부용). 한국어가 없으면 원본 반환."""
    if not text or not _is_korean(text):
        return text

    try:
        await asyncio.sleep(0.5)  # Rate limit 방지
        client = anthropic.AsyncAnthropic(api_key=settings.claude_api_key)
        message = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=[{
                "role": "user",
                "content": f"Translate to English, return ONLY the translation:\n\n{text}"
            }]
        )
        return message.content[0].text.strip()
    except Exception as e:
        logger.error(f"Translation failed: {e}")
        return text


SYSTEM_PROMPT = """당신은 전 세계 뉴스 분석가입니다.
주어진 뉴스 기사를 분석하여 JSON 형식으로 정보를 추출합니다.
모든 텍스트 출력은 반드시 한국어로 작성하세요."""

USER_PROMPT_TEMPLATE = """다음 뉴스 기사를 분석하고 JSON으로 응답하세요.

제목: {title}

다음 형식으로만 응답하세요 (다른 텍스트 없이):
{{
  "summary_title": "한 줄 요약 제목 (50자 이내, 한국어)",
  "summary_what": "무슨 일이 있었는지 설명 (3~5문장, 한국어)",
  "summary_impact": "어떤 영향이나 결과가 있을 것인지 (2~3문장, 한국어)",
  "threat_level": 1,
  "country_codes": ["ISO_코드1", "ISO_코드2"],
  "attacker_codes": [],
  "victim_codes": []
}}

threat_level: 1~5 (1=경미, 5=심각)
country_codes: 사건과 직접 관련된 모든 국가 ISO 3166-1 alpha-2 코드.
attacker_codes: 공격/주도를 한 국가 (해당 없으면 []).
victim_codes: 피해를 입은 국가들 (해당 없으면 []).
국가를 특정할 수 없으면 빈 배열 []."""


_REPLACEMENT_CHAR = "�"


_KO_FIELDS = {"summary_title", "summary_what", "summary_impact"}

def _has_replacement_char(data: dict) -> bool:
    """한국어 필드에만 U+FFFD(깨진 문자) 여부 확인."""
    for k, v in data.items():
        if k in _KO_FIELDS and isinstance(v, str) and _REPLACEMENT_CHAR in v:
            return True
    return False


def _generate_animation_config(data: dict, category: str) -> dict:
    """Claude 응답에서 animation_config 생성."""
    countries = data.get("country_codes", [])
    attacker = data.get("attacker_codes", [])
    victim = data.get("victim_codes", [])
    threat = data.get("threat_level", 1)

    arrows = []
    if attacker and victim:
        for a in attacker:
            for v in victim:
                arrows.append({"from": a, "to": v, "type": category})

    icon_map = {
        "security": "lock",
        "conflict": "bomb",
        "politics": "flag",
        "tech": "cpu",
        "sports": "trophy",
    }

    return {
        "affected_countries": countries,
        "arrows": arrows,
        "threat_level": threat,
        "icon": icon_map.get(category, "alert"),
        "category": category,
    }


async def summarize_article(title: str, category: str = "general", max_retries: int = 3) -> tuple[Optional[dict], dict]:
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

            result["animation_config"] = json.dumps(_generate_animation_config(result, category))
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
            await asyncio.sleep(0.3)
            category = article.get("category", "general")
            result, usage = await summarize_article(article.get("source_title", ""), category=category)
            total_tokens["input"] += usage["input"]
            total_tokens["output"] += usage["output"]
            if result:
                article.update(result)
                # 한국어 요약을 영어로 번역
                article["summary_title_en"] = await _translate_to_english(result.get("summary_title", ""))
                article["summary_what_en"] = await _translate_to_english(result.get("summary_what", ""))
                article["summary_impact_en"] = await _translate_to_english(result.get("summary_impact", ""))
                article["ai_processed"] = True
            else:
                article["threat_level"] = 0
                article["country_codes"] = []
                article["summary_title_en"] = ""
                article["summary_what_en"] = ""
                article["summary_impact_en"] = ""
                article["animation_config"] = json.dumps({"affected_countries": [], "arrows": []})
                article["ai_processed"] = False
            return article

    tasks = [_process(a) for a in articles]
    processed = await asyncio.gather(*tasks)
    return list(processed), total_tokens
