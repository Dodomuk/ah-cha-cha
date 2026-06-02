from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.models.database import SessionLocal
from app.models.market import MarketSnapshot, MarketHistory
from app.models.schemas import MarketSnapshotOut, MarketsResponse, CountryMarketDetail, HistoryPoint
from app.config import settings

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/market/countries", response_model=MarketsResponse)
def get_all_markets(db: Session = Depends(get_db)):
    """전 세계 모든 시장 최신 스냅샷 — 지도 렌더링용."""
    rows = db.execute(select(MarketSnapshot)).scalars().all()
    markets = {r.country_code: MarketSnapshotOut.model_validate(r) for r in rows}
    updated_at = max((r.updated_at for r in rows), default=datetime.now(timezone.utc))
    return MarketsResponse(markets=markets, updated_at=updated_at)


@router.get("/market/country/{country_code}", response_model=CountryMarketDetail)
def get_country_market(country_code: str, db: Session = Depends(get_db)):
    """특정 국가 스냅샷 + 30일 이력."""
    code = country_code.upper()
    snapshot = db.execute(
        select(MarketSnapshot).where(MarketSnapshot.country_code == code)
    ).scalar_one_or_none()

    if not snapshot:
        raise HTTPException(status_code=404, detail=f"No market data for {code}")

    from app.services.market_fetcher import fetch_history_30d
    history_raw = fetch_history_30d(db, code)
    history = [HistoryPoint(date=p["date"], close=p["close"]) for p in history_raw]

    return CountryMarketDetail(
        snapshot=MarketSnapshotOut.model_validate(snapshot),
        history=history,
    )


@router.get("/market/country/{country_code}/movers")
def get_country_movers(country_code: str):
    """국가별 오늘 주요 종목 무버스 + 주도 섹터 요약."""
    from app.services.stock_fetcher import get_country_movers
    return get_country_movers(country_code.upper())


@router.get("/market/stock/{ticker:path}/detail")
def get_stock_detail(ticker: str):
    """종목 상세 — 30일 차트 + 뉴스 하이라이트 + 글로벌 스프레드."""
    from app.services.stock_fetcher import get_stock_detail
    return get_stock_detail(ticker)


@router.post("/internal/market/fetch")
def trigger_market_fetch(
    x_internal_key: str = Header(alias="X-Internal-Key"),
    db: Session = Depends(get_db),
):
    """시장 데이터 수동 수집 트리거."""
    if x_internal_key != settings.internal_api_key:
        raise HTTPException(status_code=403, detail="Forbidden")

    from app.services.market_fetcher import fetch_all_markets
    updated = fetch_all_markets(db)
    return {"updated": updated}
