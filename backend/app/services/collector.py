import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.models.news import NewsArticle, CountryThreatLevel
from app.services.gdelt import fetch_security_news
from app.services.summarizer import summarize_batch

logger = logging.getLogger(__name__)


async def run_collection_cycle(db: Session) -> int:
    logger.info("Starting news collection cycle")

    raw_articles = await fetch_security_news(limit=75)
    if not raw_articles:
        logger.warning("No articles fetched from GDELT")
        return 0

    # 중복 URL 필터링
    urls = [a["url"] for a in raw_articles]
    existing = db.execute(
        select(NewsArticle.url).where(NewsArticle.url.in_(urls))
    ).scalars().all()
    existing_set = set(existing)

    new_articles = [a for a in raw_articles if a["url"] not in existing_set]
    logger.info(f"New articles to process: {len(new_articles)}/{len(raw_articles)}")

    if not new_articles:
        _update_threat_snapshot(db)
        return 0

    # Claude Haiku 배치 요약
    processed = await summarize_batch(new_articles)

    # DB 저장
    saved = 0
    for article in processed:
        try:
            obj = NewsArticle(
                url=article["url"],
                source_title=article.get("source_title"),
                source_domain=article.get("source_domain"),
                published_at=article.get("published_at"),
                summary_title=article.get("summary_title"),
                summary_what=article.get("summary_what"),
                summary_impact=article.get("summary_impact"),
                threat_level=int(article.get("threat_level", 0)),
                country_codes=article.get("country_codes") or [],
                ai_processed=article.get("ai_processed", False),
            )
            db.add(obj)
            saved += 1
        except Exception as e:
            logger.error(f"Failed to save article: {e}")

    db.commit()
    logger.info(f"Saved {saved} new articles")

    _update_threat_snapshot(db)
    return saved


def _update_threat_snapshot(db: Session) -> None:
    now = datetime.now(timezone.utc)
    from datetime import timedelta
    cutoff = now - timedelta(hours=24)

    rows = db.execute(
        select(NewsArticle.country_codes, NewsArticle.threat_level)
        .where(
            NewsArticle.collected_at >= cutoff,
            NewsArticle.threat_level > 0,
            NewsArticle.country_codes.isnot(None),
        )
    ).all()

    # 국가별 최고 위협 레벨 집계
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
