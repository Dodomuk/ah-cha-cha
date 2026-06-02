"""Alpha Vantage을 이용해 전 세계 주요 지수 데이터를 수집한다."""

import logging
import time
from datetime import datetime, timezone, date, timedelta

import requests
from sqlalchemy.orm import Session
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.models.market import MarketSnapshot, MarketHistory
from app.services.market_config import MARKET_CONFIG
from app.config import settings

logger = logging.getLogger(__name__)

ALPHA_VANTAGE_BASE = "https://www.alphavantage.co/query"


def _is_market_open(open_utc: str, close_utc: str) -> bool:
    """UTC 기준 현재 시각이 장 운영 시간 내인지 판단 (자정 넘김 처리 포함)."""
    now = datetime.now(timezone.utc).time()
    o_h, o_m = map(int, open_utc.split(":"))
    c_h, c_m = map(int, close_utc.split(":"))
    open_t = datetime.min.replace(hour=o_h, minute=o_m).time()
    close_t = datetime.min.replace(hour=c_h, minute=c_m).time()

    if open_t < close_t:
        return open_t <= now <= close_t
    return now >= open_t or now <= close_t


def _alpha_vantage_timeseries(ticker: str, days: int = 5) -> dict | None:
    """Alpha Vantage 일봉 데이터"""
    try:
        resp = requests.get(
            ALPHA_VANTAGE_BASE,
            params={
                "function": "TIME_SERIES_DAILY",
                "symbol": ticker,
                "outputsize": "full",
                "apikey": settings.alpha_vantage_api_key,
            },
            timeout=10
        )
        resp.raise_for_status()
        data = resp.json()
        ts = data.get("Time Series", {})

        if not ts:
            logger.warning(f"TimeSeries API returned empty data for {ticker}: {data}")
            return None

        # 최근 N일의 데이터만 반환
        sorted_dates = sorted(ts.keys(), reverse=True)[:days]
        result = {}
        for date_str in sorted_dates:
            result[date_str] = {
                "open": float(ts[date_str].get("1. open", 0)),
                "high": float(ts[date_str].get("2. high", 0)),
                "low": float(ts[date_str].get("3. low", 0)),
                "close": float(ts[date_str].get("4. close", 0)),
                "volume": int(ts[date_str].get("5. volume", 0) or 0),
            }

        return result if result else None
    except Exception as e:
        logger.error(f"TimeSeries API error for {ticker}: {e}")
        return None


def fetch_all_markets(db: Session) -> int:
    """모든 시장 데이터를 Alpha Vantage으로 가져와 DB에 upsert한다. 업데이트된 건수 반환."""
    updated = 0
    now = datetime.now(timezone.utc)

    for cfg in MARKET_CONFIG:
        ticker = cfg["ticker"]
        code = cfg["country_code"]
        try:
            ts = _alpha_vantage_timeseries(ticker, days=5)
            if not ts or len(ts) < 2:
                logger.warning(f"Not enough timeseries data for {ticker} ({code})")
                continue

            # 최근 2일로 변화율 계산
            sorted_dates = sorted(ts.keys(), reverse=True)
            current = ts[sorted_dates[0]]["close"]
            prev = ts[sorted_dates[1]]["close"]
            change_abs = current - prev
            change_pct = (change_abs / prev) * 100 if prev else 0.0
            is_open = _is_market_open(cfg["open_utc"], cfg["close_utc"])

            # upsert market_snapshots
            snap_values = dict(
                country_code=code,
                index_name=cfg["index_name"],
                index_name_ko=cfg["index_name_ko"],
                ticker=ticker,
                current_value=current,
                prev_close=prev,
                change_pct=round(change_pct, 4),
                change_abs=round(change_abs, 4),
                is_open=is_open,
                updated_at=now,
            )
            stmt = pg_insert(MarketSnapshot).values(**snap_values)
            stmt = stmt.on_conflict_do_update(
                index_elements=["country_code"],
                set_={k: stmt.excluded[k] for k in snap_values if k != "country_code"},
            )
            db.execute(stmt)

            # market_history upsert (최근 5일치)
            for date_str in sorted(ts.keys()):
                data = ts[date_str]
                d = datetime.strptime(date_str, "%Y-%m-%d").date()

                hist_values = dict(
                    country_code=code,
                    date=d,
                    open=data["open"],
                    high=data["high"],
                    low=data["low"],
                    close=data["close"],
                    volume=data["volume"],
                )
                hist_stmt = pg_insert(MarketHistory).values(**hist_values)
                hist_stmt = hist_stmt.on_conflict_do_nothing()
                db.execute(hist_stmt)

            updated += 1

        except Exception as e:
            logger.error(f"Error processing {ticker} ({code}): {e}")
            continue

        time.sleep(0.25)  # Alpha Vantage rate limit (분당 5 요청)

    db.commit()
    logger.info(f"Market fetch complete: {updated}/{len(MARKET_CONFIG)} markets updated")
    return updated


def fetch_history_30d(db: Session, country_code: str) -> list[dict]:
    """최근 30일 종가 이력 반환 (DB 우선, 없으면 Alpha Vantage)."""
    # DB에서 최근 30일 데이터 조회
    cutoff = date.today() - timedelta(days=30)
    rows = db.execute(
        select(MarketHistory)
        .where(MarketHistory.country_code == country_code)
        .where(MarketHistory.date >= cutoff)
        .order_by(MarketHistory.date)
    ).scalars().all()

    if rows:
        return [{"date": r.date.strftime("%Y-%m-%d"), "close": r.close} for r in rows]

    # DB에 없으면 Alpha Vantage 호출 (마지막 수단)
    cfg = next((m for m in MARKET_CONFIG if m["country_code"] == country_code), None)
    if not cfg:
        return []

    try:
        ts = _alpha_vantage_timeseries(cfg["ticker"], days=30)
        if not ts:
            return []

        result = []
        for date_str in sorted(ts.keys()):
            result.append({
                "date": date_str,
                "close": round(ts[date_str]["close"], 4),
            })

        return result
    except Exception as e:
        logger.error(f"fetch_history_30d failed for {country_code}: {e}")
        return []
