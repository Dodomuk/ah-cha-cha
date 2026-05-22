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
def get_countries(db: Session = Depends(get_db)):
    # 국가별 최신 스냅샷 조회 (DISTINCT ON)
    subq = (
        select(
            CountryThreatLevel.country_code,
            CountryThreatLevel.threat_level,
            CountryThreatLevel.article_count,
            CountryThreatLevel.snapshot_at,
        )
        .distinct(CountryThreatLevel.country_code)
        .order_by(CountryThreatLevel.country_code, CountryThreatLevel.snapshot_at.desc())
        .subquery()
    )

    rows = db.execute(select(subq)).all()

    countries: dict[str, CountryThreatOut] = {
        row.country_code: CountryThreatOut(
            threat_level=row.threat_level,
            article_count=row.article_count,
        )
        for row in rows
    }

    snapshot_at = max((r.snapshot_at for r in rows), default=datetime.now(timezone.utc))

    return CountriesResponse(snapshot_at=snapshot_at, countries=countries)


@router.get("/countries/{code}/news", response_model=CountryNewsResponse)
def get_country_news(
    code: str,
    hours: int = 24,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    code = code.upper()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=min(hours, 168))
    limit = min(limit, 50)

    articles = db.execute(
        select(NewsArticle)
        .where(
            NewsArticle.country_codes.contains([code]),
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
    return {"message": "collection job accepted"}
