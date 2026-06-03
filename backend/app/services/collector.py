import re
import json
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.models.news import NewsArticle, CountryThreatLevel
from app.services.rss import fetch_security_news, fetch_all_news
from app.services.summarizer import summarize_batch
from app.config import settings

logger = logging.getLogger(__name__)


def _title_words(title: str) -> set[str]:
    """제목에서 의미 있는 단어 집합 추출 (3자 이상)"""
    return {w for w in re.sub(r'[^\w\s]', '', title.lower()).split() if len(w) >= 3}


def _are_similar_titles(t1: str, t2: str, threshold: float = 0.5) -> bool:
    """Jaccard 유사도로 두 제목이 같은 사건을 다루는지 판단"""
    w1, w2 = _title_words(t1), _title_words(t2)
    if len(w1) < 3 or len(w2) < 3:
        return False
    union = w1 | w2
    return len(w1 & w2) / len(union) >= threshold if union else False


def _dedup_by_title(articles: list[dict]) -> list[dict]:
    """같은 수집 배치 내 유사 제목 기사 제거 (위협 레벨 높은 것 또는 첫 번째 유지)"""
    kept: list[dict] = []
    for article in articles:
        title = article.get("source_title", "")
        if not any(_are_similar_titles(title, k.get("source_title", "")) for k in kept):
            kept.append(article)
    return kept

USAGE_LOG_PATH = Path(__file__).resolve().parents[3] / "logs" / "api_usage.log"


def _append_usage_log(entry: dict) -> None:
    USAGE_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(USAGE_LOG_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


async def run_collection_cycle(db: Session) -> int:
    """RSS 수집 (모든 카테고리). TEST_MODE에서는 AI 요약을 건너뛴다."""
    logger.info("Starting RSS collection cycle")

    raw_articles = await fetch_all_news(limit=300)
    if not raw_articles:
        logger.warning("No articles fetched from RSS")
        return 0

    urls = [a["url"] for a in raw_articles]
    existing = db.execute(
        select(NewsArticle.url).where(NewsArticle.url.in_(urls))
    ).scalars().all()
    existing_set = set(existing)

    new_articles = [a for a in raw_articles if a["url"] not in existing_set]
    before_dedup = len(new_articles)
    new_articles = _dedup_by_title(new_articles)
    logger.info(
        f"New articles to save: {len(new_articles)}/{len(raw_articles)} "
        f"(title dedup: {before_dedup - len(new_articles)} removed)"
    )

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
                category=article.get("category", "general"),
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
    updated_articles = []
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
            obj.summary_title_en = data.get("summary_title_en")
            obj.summary_what_en = data.get("summary_what_en")
            obj.summary_impact_en = data.get("summary_impact_en")
            obj.threat_level = int(data.get("threat_level", 0))
            obj.country_codes = data.get("country_codes") or []
            obj.attacker_codes = data.get("attacker_codes") or []
            obj.victim_codes = data.get("victim_codes") or []
            obj.ai_processed = True
            updated += 1
            updated_articles.append(obj)

    db.commit()

    # WebSocket broadcast
    if updated_articles:
        try:
            from app.api.routes import manager
            for article in updated_articles:
                if article.threat_level > 0:
                    event = {
                        "type": "new_event",
                        "id": str(article.id),
                        "title": article.summary_title,
                        "summary": article.summary_what,
                        "category": article.category or "general",
                        "threat_level": article.threat_level,
                        "countries": article.country_codes or [],
                        "animation_config": article.animation_config,
                        "collected_at": article.collected_at.isoformat() if article.collected_at else None,
                    }
                    await manager.broadcast(event)
        except Exception as e:
            logger.warning(f"WebSocket broadcast failed: {e}")

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


async def run_retranslation_cycle(db: Session, limit: int = 50) -> dict:
    """영어 요약이 없는 기존 기사들에 영어 필드를 추가한다."""
    from sqlalchemy import and_

    pending = db.execute(
        select(NewsArticle)
        .where(and_(NewsArticle.ai_processed.is_(True), NewsArticle.summary_title_en.is_(None)))
        .order_by(NewsArticle.collected_at.desc())
        .limit(limit)
    ).scalars().all()

    if not pending:
        logger.info("No articles need retranslation")
        return {"retranslated": 0, "remaining": 0}

    logger.info(f"Retranslating {len(pending)} articles...")

    articles_data = [{"url": a.url, "source_title": a.source_title or ""} for a in pending]
    processed, tokens = await summarize_batch(articles_data)

    updated = 0
    for data in processed:
        if not data.get("ai_processed"):
            continue
        obj = db.execute(
            select(NewsArticle).where(NewsArticle.url == data["url"])
        ).scalar_one_or_none()
        if obj and data.get("summary_title_en"):
            obj.summary_title_en = data.get("summary_title_en")
            obj.summary_what_en = data.get("summary_what_en")
            obj.summary_impact_en = data.get("summary_impact_en")
            updated += 1

    db.commit()

    remaining = db.execute(
        select(func.count()).select_from(NewsArticle)
        .where(and_(NewsArticle.ai_processed.is_(True), NewsArticle.summary_title_en.is_(None)))
    ).scalar()

    haiku_input_price = 0.80 / 1_000_000
    haiku_output_price = 4.00 / 1_000_000
    cost_usd = (tokens["input"] * haiku_input_price) + (tokens["output"] * haiku_output_price)
    logger.info(f"Retranslation done: {updated}/{len(pending)}, cost=${cost_usd:.4f}, remaining={remaining}")

    return {"retranslated": updated, "remaining": remaining, "cost_usd": round(cost_usd, 6)}


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
