"""
기존 보안 뉴스 서비스 API (/legacy)

상태:
- 새로운 수집은 중단됨
- 기존 데이터 (NewsArticle)는 조회만 가능
- /legacy 경로 하에서만 제공
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from app.models.database import get_db
from app.models.news import NewsArticle, CountryThreatLevel
from app.models.schemas import (
    CountriesResponse, CountryNewsResponse, LatestNewsResponse,
    CountryThreatOut, NewsArticleOut, StatsResponse,
    TrendResponse, TrendPoint, SearchResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/legacy", tags=["legacy"])

KST = timezone(timedelta(hours=9))


def parse_date_range(start: Optional[str], end: Optional[str]):
    """YYYY-MM-DD KST 문자열을 UTC datetime 범위로 변환한다. 최대 7일."""
    today_kst = datetime.now(KST).date()

    try:
        end_date = datetime.strptime(end, "%Y-%m-%d").date() if end else today_kst
    except ValueError:
        end_date = today_kst

    try:
        start_date = datetime.strptime(start, "%Y-%m-%d").date() if start else (end_date - timedelta(days=6))
    except ValueError:
        start_date = end_date - timedelta(days=6)

    if start_date > end_date:
        start_date = end_date
    if (end_date - start_date).days > 6:
        start_date = end_date - timedelta(days=6)

    start_dt = datetime(start_date.year, start_date.month, start_date.day, 0, 0, 0, tzinfo=KST)
    end_dt = datetime(end_date.year, end_date.month, end_date.day, 23, 59, 59, tzinfo=KST)
    return start_dt, end_dt


@router.get("/countries", response_model=CountriesResponse)
def get_countries(
    start: Optional[str] = None,
    end: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    기간 범위 내 국가별 위협 레벨 조회 (legacy)
    """
    start_dt, end_dt = parse_date_range(start, end)

    date_col = func.coalesce(NewsArticle.published_at, NewsArticle.collected_at)

    rows = db.execute(
        select(NewsArticle.country_codes, NewsArticle.threat_level)
        .where(
            date_col >= start_dt,
            date_col <= end_dt,
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

    countries = [
        CountryThreatOut(code=code, level=country_max[code], count=country_count[code])
        for code in sorted(country_max.keys())
    ]
    return CountriesResponse(countries=countries)


@router.get("/countries/{country_code}/news", response_model=CountryNewsResponse)
def get_country_news(
    country_code: str,
    start: Optional[str] = None,
    end: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """
    특정 국가의 보안 뉴스 조회 (legacy)
    """
    start_dt, end_dt = parse_date_range(start, end)

    date_col = func.coalesce(NewsArticle.published_at, NewsArticle.collected_at)

    articles = db.execute(
        select(NewsArticle)
        .where(
            date_col >= start_dt,
            date_col <= end_dt,
            NewsArticle.ai_processed.is_(True),
            NewsArticle.country_codes.contains([country_code.upper()])
        )
        .order_by(date_col.desc())
        .limit(limit)
    ).scalars().all()

    return CountryNewsResponse(
        country_code=country_code.upper(),
        articles=[
            NewsArticleOut(
                id=str(a.id),
                url=a.url,
                title=a.summary_title or a.source_title,
                source_domain=a.source_domain,
                threat_level=a.threat_level,
                countries=a.country_codes or [],
                category=a.category,
                collected_at=a.collected_at.isoformat() if a.collected_at else None,
            )
            for a in articles
        ]
    )


@router.get("/events", response_model=LatestNewsResponse)
def get_latest_events(
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """
    최신 보안 뉴스 조회 (legacy)
    """
    articles = db.execute(
        select(NewsArticle)
        .where(
            NewsArticle.ai_processed.is_(True),
            NewsArticle.threat_level > 0,
        )
        .order_by(
            NewsArticle.collected_at.desc()
        )
        .limit(limit)
    ).scalars().all()

    return LatestNewsResponse(
        articles=[
            NewsArticleOut(
                id=str(a.id),
                url=a.url,
                title=a.summary_title or a.source_title,
                source_domain=a.source_domain,
                threat_level=a.threat_level,
                countries=a.country_codes or [],
                category=a.category,
                collected_at=a.collected_at.isoformat() if a.collected_at else None,
            )
            for a in articles
        ]
    )


@router.get("/stats", response_model=StatsResponse)
def get_stats(
    start: Optional[str] = None,
    end: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    기간별 통계 조회 (legacy)
    """
    start_dt, end_dt = parse_date_range(start, end)

    date_col = func.coalesce(NewsArticle.published_at, NewsArticle.collected_at)

    total = db.execute(
        select(func.count())
        .select_from(NewsArticle)
        .where(
            date_col >= start_dt,
            date_col <= end_dt,
            NewsArticle.ai_processed.is_(True)
        )
    ).scalar()

    by_level = db.execute(
        select(NewsArticle.threat_level, func.count())
        .where(
            date_col >= start_dt,
            date_col <= end_dt,
            NewsArticle.ai_processed.is_(True),
            NewsArticle.threat_level > 0,
        )
        .group_by(NewsArticle.threat_level)
    ).all()

    return StatsResponse(
        total_articles=total,
        by_threat_level={str(level): count for level, count in by_level}
    )


@router.get("/search", response_model=SearchResponse)
def search_articles(
    q: str,
    limit: int = 30,
    db: Session = Depends(get_db),
):
    """
    기사 검색 (legacy)
    """
    if not q or len(q) < 2:
        raise HTTPException(status_code=400, detail="Search query too short")

    articles = db.execute(
        select(NewsArticle)
        .where(
            NewsArticle.ai_processed.is_(True),
            (NewsArticle.source_title.ilike(f"%{q}%")) |
            (NewsArticle.summary_title.ilike(f"%{q}%")) |
            (NewsArticle.summary_what.ilike(f"%{q}%"))
        )
        .order_by(NewsArticle.collected_at.desc())
        .limit(limit)
    ).scalars().all()

    return SearchResponse(
        query=q,
        results=[
            NewsArticleOut(
                id=str(a.id),
                url=a.url,
                title=a.summary_title or a.source_title,
                source_domain=a.source_domain,
                threat_level=a.threat_level,
                countries=a.country_codes or [],
                category=a.category,
                collected_at=a.collected_at.isoformat() if a.collected_at else None,
            )
            for a in articles
        ]
    )
