from typing import Optional
import json
import logging
import asyncio
import anthropic
from app.config import settings

logger = logging.getLogger(__name__)

# IT 뉴스 전용 프롬프트 (최소화)
SYSTEM_PROMPT = "You are a tech news summarizer. Output only JSON."

USER_PROMPT_TEMPLATE = """Summarize this IT news in Korean. Return ONLY valid JSON with no markdown:
{{
  "summary_title": "한 줄 제목 (40자 이내)",
  "summary_what": "무슨 일 (2~3문장)",
  "summary_impact": "영향 (1~2문장)"
}}

Title: {title}"""


async def summarize_article(title: str, category: str = "general") -> tuple[Optional[dict], dict]:
    """
    IT 뉴스를 요약합니다.
    Returns (result, token_usage)

    비용 최적화:
    - 제목만 사용 (앞 300자로 제한)
    - 프롬프트 최소화
    - 요약 필드만 (한국어 + 영어)
    """
    zero_usage = {"input": 0, "output": 0}

    if not settings.claude_api_key:
        logger.warning("CLAUDE_API_KEY not set, skipping summarization")
        return None, zero_usage

    client = anthropic.AsyncAnthropic(api_key=settings.claude_api_key)

    try:
        # 제목을 300자로 제한 (역피라미드 구조)
        truncated_title = title[:300]

        message = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=256,
            system=SYSTEM_PROMPT,
            messages=[
                {"role": "user", "content": USER_PROMPT_TEMPLATE.format(title=truncated_title)}
            ],
        )

        usage = {
            "input": message.usage.input_tokens,
            "output": message.usage.output_tokens,
        }

        raw = message.content[0].text.strip()

        # JSON 파싱 (마크다운 코드 블록 제거)
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        result = json.loads(raw)
        result["ai_processed"] = True

        return result, usage

    except json.JSONDecodeError as e:
        logger.error(f"JSON parse failed: {title[:60]} - {e}")
        return None, zero_usage
    except Exception as e:
        logger.error(f"Claude API error: {e}")
        return None, zero_usage


async def summarize_batch(articles: list[dict], concurrency: int = 5) -> tuple[list[dict], dict]:
    """
    배치 처리로 10개씩 요약 (비용 최적화)
    concurrency=5: 4개 동시 요청 + rate limit 완화
    """
    semaphore = asyncio.Semaphore(concurrency)
    total_tokens = {"input": 0, "output": 0}

    async def _process(article: dict) -> dict:
        async with semaphore:
            await asyncio.sleep(0.2)  # Rate limit 방지
            category = article.get("category", "general")
            result, usage = await summarize_article(article.get("source_title", ""), category=category)

            total_tokens["input"] += usage["input"]
            total_tokens["output"] += usage["output"]

            if result:
                article.update(result)
                article["ai_processed"] = True
            else:
                article["summary_title"] = ""
                article["summary_what"] = ""
                article["summary_impact"] = ""
                article["ai_processed"] = False

            return article

    tasks = [_process(a) for a in articles]
    processed = await asyncio.gather(*tasks)

    return list(processed), total_tokens
