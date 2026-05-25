from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from app.models.database import get_db
from app.models.news import NewsArticle, CountryThreatLevel
from app.models.schemas import (
    CountriesResponse, CountryNewsResponse, LatestNewsResponse,
    CountryThreatOut, NewsArticleOut,
)
from app.config import settings

router = APIRouter()


@router.get("/countries", response_model=CountriesResponse)
def get_countries(hours: int = 168, db: Session = Depends(get_db)):
    hours = min(max(hours, 1), 168)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)

    rows = db.execute(
        select(NewsArticle.country_codes, NewsArticle.threat_level)
        .where(
            NewsArticle.collected_at >= cutoff,
            NewsArticle.threat_level > 0,
            NewsArticle.ai_processed.is_(True),
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

    countries: dict[str, CountryThreatOut] = {
        code: CountryThreatOut(threat_level=level, article_count=country_count[code])
        for code, level in country_max.items()
    }

    return CountriesResponse(
        snapshot_at=datetime.now(timezone.utc),
        countries=countries,
    )


@router.get("/countries/{code}/news", response_model=CountryNewsResponse)
def get_country_news(
    code: str,
    hours: int = 168,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    code = code.upper()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=min(hours, 168))
    limit = min(limit, 50)

    articles = db.execute(
        select(NewsArticle)
        .where(
            NewsArticle.country_codes.any(code),
            NewsArticle.collected_at >= cutoff,
            NewsArticle.ai_processed.is_(True),
        )
        .order_by(NewsArticle.threat_level.desc(), NewsArticle.collected_at.desc())
        .limit(limit)
    ).scalars().all()

    max_level = max((a.threat_level for a in articles), default=0)

    return CountryNewsResponse(
        country_code=code,
        threat_level=max_level,
        articles=[NewsArticleOut.model_validate(a) for a in articles],
    )


@router.get("/news/latest", response_model=LatestNewsResponse)
def get_latest_news(
    limit: int = 30,
    min_level: int = 1,
    db: Session = Depends(get_db),
):
    limit = min(limit, 100)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

    articles = db.execute(
        select(NewsArticle)
        .where(
            NewsArticle.threat_level >= min_level,
            NewsArticle.collected_at >= cutoff,
            NewsArticle.ai_processed.is_(True),
        )
        .order_by(NewsArticle.threat_level.desc(), NewsArticle.collected_at.desc())
        .limit(limit)
    ).scalars().all()

    return LatestNewsResponse(articles=[NewsArticleOut.model_validate(a) for a in articles])


@router.post("/internal/collect")
async def trigger_collection(
    x_internal_key: str = Header(alias="X-Internal-Key"),
):
    if x_internal_key != settings.internal_api_key:
        raise HTTPException(status_code=403, detail="Forbidden")

    from app.services.collector import run_collection_cycle
    from app.models.database import SessionLocal
    import asyncio

    async def _run():
        db = SessionLocal()
        try:
            await run_collection_cycle(db)
        finally:
            db.close()

    asyncio.create_task(_run())
    mode = "TEST_MODE(요약 제외)" if settings.test_mode else "자동 요약 포함"
    return {"message": f"collection job accepted [{mode}]"}


@router.post("/internal/summarize")
async def trigger_summarization(
    x_internal_key: str = Header(alias="X-Internal-Key"),
):
    """미처리 기사들을 Claude API로 요약한다. TEST_MODE에서 수동 실행용."""
    if x_internal_key != settings.internal_api_key:
        raise HTTPException(status_code=403, detail="Forbidden")

    from app.services.collector import run_summarization_cycle
    from app.models.database import SessionLocal
    from sqlalchemy import select
    from app.models.news import NewsArticle

    db = SessionLocal()
    try:
        pending_count = db.execute(
            select(func.count()).select_from(NewsArticle).where(NewsArticle.ai_processed.is_(False))
        ).scalar()
    finally:
        db.close()

    if pending_count == 0:
        return {"message": "요약 대기 기사 없음", "pending": 0}

    import asyncio

    async def _run():
        db = SessionLocal()
        try:
            await run_summarization_cycle(db)
        finally:
            db.close()

    asyncio.create_task(_run())
    return {"message": f"summarization job accepted", "pending": pending_count}
