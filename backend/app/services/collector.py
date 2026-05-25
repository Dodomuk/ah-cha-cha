import json
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.models.news import NewsArticle, CountryThreatLevel
from app.services.rss import fetch_security_news
from app.services.summarizer import summarize_batch
from app.config import settings

logger = logging.getLogger(__name__)

USAGE_LOG_PATH = Path(__file__).resolve().parents[3] / "logs" / "api_usage.log"


def _append_usage_log(entry: dict) -> None:
    USAGE_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(USAGE_LOG_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


async def run_collection_cycle(db: Session) -> int:
    """RSS 수집만 수행. TEST_MODE에서는 AI 요약을 건너뛴다."""
    logger.info("Starting RSS collection cycle")

    raw_articles = await fetch_security_news(limit=75)
    if not raw_articles:
        logger.warning("No articles fetched from RSS")
        return 0

    urls = [a["url"] for a in raw_articles]
    existing = db.execute(
        select(NewsArticle.url).where(NewsArticle.url.in_(urls))
    ).scalars().all()
    existing_set = set(existing)

    new_articles = [a for a in raw_articles if a["url"] not in existing_set]
    logger.info(f"New articles to save: {len(new_articles)}/{len(raw_articles)}")

    if not new_articles:
        return 0

    saved = 0
    for article in new_articles:
        try:
            obj = NewsArticle(
                url=article["url"],
                source_title=article.get("source_title"),
                source_domain=article.get("source_domain"),
                published_at=article.get("published_at"),
                threat_level=0,
                country_codes=[],
                ai_processed=False,
            )
            db.add(obj)
            saved += 1
        except Exception as e:
            logger.error(f"Failed to save article: {e}")

    db.commit()

    if settings.test_mode:
        logger.info(f"Saved {saved} new articles [TEST_MODE: 요약 대기 중, /internal/summarize 로 수동 실행]")
    else:
        logger.info(f"Saved {saved} new articles, starting summarization...")
        await run_summarization_cycle(db)

    return saved


async def run_summarization_cycle(db: Session) -> dict:
    """ai_processed=False 기사들을 Claude API로 요약 처리하고 사용량을 로그에 기록한다."""
    pending = db.execute(
        select(NewsArticle)
        .where(NewsArticle.ai_processed.is_(False))
        .order_by(NewsArticle.collected_at.desc())
        .limit(100)
    ).scalars().all()

    if not pending:
        logger.info("No pending articles to summarize")
        return {"summarized": 0, "input_tokens": 0, "output_tokens": 0}

    logger.info(f"Summarizing {len(pending)} articles with Claude API...")

    articles_data = [{"url": a.url, "source_title": a.source_title or ""} for a in pending]
    processed, tokens = await summarize_batch(articles_data)

    updated = 0
    for data in processed:
        if not data.get("ai_processed"):
            continue
        obj = db.execute(
            select(NewsArticle).where(NewsArticle.url == data["url"])
        ).scalar_one_or_none()
        if obj:
            obj.summary_title = data.get("summary_title")
            obj.summary_what = data.get("summary_what")
            obj.summary_impact = data.get("summary_impact")
            obj.threat_level = int(data.get("threat_level", 0))
            obj.country_codes = data.get("country_codes") or []
            obj.ai_processed = True
            updated += 1

    db.commit()

    haiku_input_price = 0.80 / 1_000_000
    haiku_output_price = 4.00 / 1_000_000
    cost_usd = (tokens["input"] * haiku_input_price) + (tokens["output"] * haiku_output_price)

    log_entry = {
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "pending": len(pending),
        "summarized": updated,
        "input_tokens": tokens["input"],
        "output_tokens": tokens["output"],
        "cost_usd": round(cost_usd, 6),
    }
    _append_usage_log(log_entry)

    logger.info(
        f"Summarization done: {updated}/{len(pending)} articles, "
        f"tokens in={tokens['input']} out={tokens['output']}, "
        f"cost=${cost_usd:.4f}"
    )

    _update_threat_snapshot(db)
    return log_entry


def _update_threat_snapshot(db: Session) -> None:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=168)

    rows = db.execute(
        select(NewsArticle.country_codes, NewsArticle.threat_level)
        .where(
            NewsArticle.collected_at >= cutoff,
            NewsArticle.threat_level > 0,
            NewsArticle.country_codes.isnot(None),
        )
    ).all()

    country_max: dict[str, int] = {}
    country_count: dict[str, int] = {}

    for codes, level in rows:
        for code in (codes or []):
            code = code.upper()
            if not code:
                continue
            country_max[code] = max(country_max.get(code, 0), level)
            country_count[code] = country_count.get(code, 0) + 1

    for code, max_level in country_max.items():
        obj = CountryThreatLevel(
            country_code=code,
            threat_level=max_level,
            article_count=country_count[code],
            snapshot_at=now,
        )
        db.add(obj)

    if country_max:
        db.commit()
        logger.info(f"Threat snapshot updated for {len(country_max)} countries")
