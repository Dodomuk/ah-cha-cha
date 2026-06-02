import json
import logging
import asyncio
import anthropic
from app.config import settings

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """You are a cybersecurity news analyst.
Analyze the given news article and extract information in JSON format.
Provide summaries in BOTH Korean and English."""

USER_PROMPT_TEMPLATE = """Analyze the following security news article and respond with JSON only.

Title: {title}

Respond ONLY in this exact format (no other text):
{{
  "summary_title": "한 줄 요약 제목 (50자 이내, 한국어)",
  "summary_what": "무슨 일이 있었는지 설명 (3~5문장, 한국어)",
  "summary_impact": "어떤 피해나 영향이 발생했는지 (2~3문장, 한국어)",
  "summary_title_en": "One-line summary title (under 80 chars, English)",
  "summary_what_en": "What happened (3-5 sentences, English)",
  "summary_impact_en": "Damages and impact (2-3 sentences, English)",
  "threat_level": <integer 0-4>,
  "country_codes": ["ISO_CODE1", "ISO_CODE2"],
  "attacker_codes": ["ATTACKER_COUNTRY_ISO"],
  "victim_codes": ["VICTIM_COUNTRY_ISO"]
}}

Threat level criteria:
- 0: Unrelated to security or minor general info
- 1: Security patch advisory, vulnerability discovery, minor phishing
- 2: Small-scale hack, data leak, vulnerability exploitation
- 3: Financial/corporate breach, large-scale data leak
- 4: Critical infrastructure attack, cyberwar, large-scale ransomware

country_codes: All ISO 3166-1 alpha-2 codes of countries directly involved.
attacker_codes: Countries attributed as attackers (only if confirmed). Empty array if unknown.
victim_codes: Countries that were victims. Empty array if unknown."""


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
                max_tokens=1024,
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
