"""yfinance를 이용해 전 세계 주요 지수 데이터를 수집한다."""

import logging
from datetime import datetime, timezone, date, timedelta

import yfinance as yf
from sqlalchemy.orm import Session
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.models.market import MarketSnapshot, MarketHistory
from app.services.market_config import MARKET_CONFIG

logger = logging.getLogger(__name__)


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


def fetch_all_markets(db: Session) -> int:
    """모든 시장 데이터를 yfinance로 가져와 DB에 upsert한다. 업데이트된 건수 반환."""
    tickers = [m["ticker"] for m in MARKET_CONFIG]

    try:
        # 한 번의 download 호출로 모든 티커 처리 (rate limit 최소화)
        raw = yf.download(
            tickers,
            period="5d",
            interval="1d",
            group_by="ticker",
            auto_adjust=True,
            progress=False,
            threads=True,
        )
    except Exception as e:
        logger.error(f"yfinance download failed: {e}")
        return 0

    updated = 0
    now = datetime.now(timezone.utc)

    for cfg in MARKET_CONFIG:
        ticker = cfg["ticker"]
        code = cfg["country_code"]
        try:
            # 멀티 티커 응답 구조: raw[ticker]["Close"] 등
            if len(tickers) == 1:
                df = raw
            else:
                df = raw[ticker] if ticker in raw.columns.get_level_values(0) else None

            if df is None or df.empty:
                logger.warning(f"No data for {ticker} ({code})")
                continue

            closes = df["Close"].dropna()
            if len(closes) < 2:
                continue

            current = float(closes.iloc[-1])
            prev = float(closes.iloc[-2])
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
            for ts, close_val in closes.items():
                d = ts.date() if hasattr(ts, "date") else ts
                row = df.loc[ts]
                hist_values = dict(
                    country_code=code,
                    date=d,
                    open=float(row["Open"]) if "Open" in row else None,
                    high=float(row["High"]) if "High" in row else None,
                    low=float(row["Low"]) if "Low" in row else None,
                    close=float(close_val),
                    volume=float(row["Volume"]) if "Volume" in row else None,
                )
                hist_stmt = pg_insert(MarketHistory).values(**hist_values)
                hist_stmt = hist_stmt.on_conflict_do_nothing()
                db.execute(hist_stmt)

            updated += 1

        except Exception as e:
            logger.error(f"Error processing {ticker} ({code}): {e}")
            continue

    db.commit()
    logger.info(f"Market fetch complete: {updated}/{len(MARKET_CONFIG)} markets updated")
    return updated


def fetch_history_30d(db: Session, country_code: str) -> list[dict]:
    """최근 30일 종가 이력 반환 (DB 우선, 없으면 yfinance — Rate Limit 방지)."""
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

    # DB에 없으면 yfinance 개별 호출 (마지막 수단)
    cfg = next((m for m in MARKET_CONFIG if m["country_code"] == country_code), None)
    if not cfg:
        return []

    try:
        df = yf.download(
            cfg["ticker"],
            period="30d",
            interval="1d",
            auto_adjust=True,
            progress=False,
        )
        if df.empty:
            return []

        result = []
        for ts, row in df.iterrows():
            close_val = row["Close"]
            if hasattr(close_val, "item"):
                close_val = close_val.item()
            result.append({
                "date": ts.strftime("%Y-%m-%d"),
                "close": round(float(close_val), 4) if close_val == close_val else None,
            })
        return result
    except Exception as e:
        logger.error(f"fetch_history_30d failed for {country_code}: {e}")
        return []
