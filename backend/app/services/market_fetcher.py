"""Finnhub을 이용해 전 세계 주요 지수 데이터를 수집한다."""

import logging
from datetime import datetime, timezone, date, timedelta

import requests
from sqlalchemy.orm import Session
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.models.market import MarketSnapshot, MarketHistory
from app.services.market_config import MARKET_CONFIG
from app.config import settings

logger = logging.getLogger(__name__)

FINNHUB_BASE = "https://finnhub.io/api/v1"


def _is_market_open(open_utc: str, close_utc: str) -> bool:
    """UTC 기준 현재 시각이 장 운영 시간 내인지 판단 (자정 넘김 처리 포함)."""
    now = datetime.now(timezone.utc).time()
    o_h, o_m = map(int, open_utc.split(":"))
    c_h, c_m = map(int, close_utc.split(":"))
    open_t = datetime.min.replace(hour=o_h, minute=o_m).time()
    close_t = datetime.min.replace(hour=c_h, minute=c_m).time()

    if open_t < close_t:
        return open_t <= now <= close_t
    # 자정 넘김 (예: 23:00 ~ 05:00)
    return now >= open_t or now <= close_t


def _finnhub_candle(ticker: str, days: int = 5) -> dict | None:
    """Finnhub 일봉 데이터"""
    try:
        now = datetime.now(timezone.utc)
        to_ts = int(now.timestamp())
        from_ts = int((now - timedelta(days=days)).timestamp())

        resp = requests.get(
            f"{FINNHUB_BASE}/stock/candle",
            params={
                "symbol": ticker,
                "resolution": "D",
                "from": from_ts,
                "to": to_ts,
                "token": settings.finnhub_api_key,
            },
            timeout=10
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.error(f"Candle API error for {ticker}: {e}")
        return None


def fetch_all_markets(db: Session) -> int:
    """모든 시장 데이터를 Finnhub으로 가져와 DB에 upsert한다. 업데이트된 건수 반환."""
    updated = 0
    now = datetime.now(timezone.utc)

    for cfg in MARKET_CONFIG:
        ticker = cfg["ticker"]
        code = cfg["country_code"]
        try:
            candle = _finnhub_candle(ticker, days=5)
            if not candle or "c" not in candle or len(candle["c"]) < 2:
                logger.warning(f"Not enough candle data for {ticker} ({code})")
                continue

            closes = candle["c"]
            current = closes[-1]
            prev = closes[-2]
            change_abs = current - prev
            change_pct = (change_abs / prev) * 100 if prev else 0.0
            is_open = _is_market_open(cfg["open_utc"], cfg["close_utc"])

            # upsert market_snapshots — PostgreSQL ON CONFLICT DO UPDATE (race condition 방지)
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
            times = candle.get("t", [])
            opens = candle.get("o", [])
            highs = candle.get("h", [])
            lows = candle.get("l", [])
            volumes = candle.get("v", [])

            for i, close_val in enumerate(closes):
                ts = times[i] if i < len(times) else None
                if ts:
                    d = datetime.fromtimestamp(ts, tz=timezone.utc).date()
                else:
                    continue

                hist_values = dict(
                    country_code=code,
                    date=d,
                    open=opens[i] if i < len(opens) else None,
                    high=highs[i] if i < len(highs) else None,
                    low=lows[i] if i < len(lows) else None,
                    close=close_val,
                    volume=volumes[i] if i < len(volumes) else None,
                )
                hist_stmt = pg_insert(MarketHistory).values(**hist_values)
                hist_stmt = hist_stmt.on_conflict_do_nothing()
                db.execute(hist_stmt)

            updated += 1

        except Exception as e:
            logger.error(f"Error processing {ticker} ({code}): {e}")
            continue

        import time
        time.sleep(0.2)  # Rate limit 방지

    db.commit()
    logger.info(f"Market fetch complete: {updated}/{len(MARKET_CONFIG)} markets updated")
    return updated


def fetch_history_30d(db: Session, country_code: str) -> list[dict]:
    """최근 30일 종가 이력 반환 (DB 우선, 없으면 Finnhub)."""
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

    # DB에 없으면 Finnhub 호출 (마지막 수단)
    cfg = next((m for m in MARKET_CONFIG if m["country_code"] == country_code), None)
    if not cfg:
        return []

    try:
        candle = _finnhub_candle(cfg["ticker"], days=30)
        if not candle or "c" not in candle:
            return []

        result = []
        closes = candle["c"]
        times = candle.get("t", [])

        for i, close_val in enumerate(closes):
            ts = times[i] if i < len(times) else None
            if ts:
                date_str = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
                result.append({
                    "date": date_str,
                    "close": round(close_val, 4) if close_val else None,
                })

        return result
    except Exception as e:
        logger.error(f"fetch_history_30d failed for {country_code}: {e}")
        return []
