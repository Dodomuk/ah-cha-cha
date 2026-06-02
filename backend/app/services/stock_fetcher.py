"""Alpha Vantage로 국가별 주요 종목 무버스, 뉴스, 상세 데이터를 수집한다."""

import logging
import re
import time
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from typing import Optional

import requests
from sqlalchemy.orm import Session
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.services.stock_config import STOCKS_BY_COUNTRY, SECTORS, TICKER_TO_SPREAD
from app.models.market import CountryMoversSnapshot
from app.config import settings

logger = logging.getLogger(__name__)

# ── 인메모리 캐시 ────────────────────────────────────────────────────
_movers_cache: dict[str, tuple[datetime, dict]] = {}
_detail_cache: dict[str, tuple[datetime, dict]] = {}
MOVERS_TTL = timedelta(minutes=60)
DETAIL_TTL = timedelta(minutes=30)

ALPHA_VANTAGE_BASE = "https://www.alphavantage.co/query"


def _cache_get(cache: dict, key: str, ttl: timedelta):
    entry = cache.get(key)
    if entry and datetime.now(timezone.utc) - entry[0] < ttl:
        return entry[1]
    return None


def _cache_set(cache: dict, key: str, value: dict):
    cache[key] = (datetime.now(timezone.utc), value)


# ── 뉴스 키워드 ──────────────────────────────────────────────────────
_HIGHLIGHT_PATTERNS = [
    r'\bearnings?\b', r'\brevenue\b', r'\bprofit\b', r'\bEPS\b', r'\bbeat\b', r'\bmiss\b',
    r'\bguidance\b', r'\boutlook\b', r'\bforecast\b', r'\bdividend\b',
    r'\bacquisition\b', r'\bmerger\b', r'\bIPO\b', r'\bbuyback\b', r'\blayoff[s]?\b',
    r'\brecall\b', r'\blawsuit\b', r'\bfine\b', r'\bpenalty\b',
    r'\bAI\b', r'\bsemiconductor\b', r'\bchip[s]?\b', r'\bEV\b', r'\bbattery\b',
    r'\bcloud\b', r'\bdata center\b', r'\b5G\b', r'\bsupply chain\b',
    r'\bFed\b', r'\binterest rate[s]?\b', r'\binflation\b', r'\btariff[s]?\b',
    r'\bsanction[s]?\b', r'\brecession\b',
    r'\bsurge[sd]?\b', r'\bplunge[sd]?\b', r'\bsoar[sed]?\b', r'\bfall[s]?\b',
    r'\brise[s]?\b', r'\bgain[s]?\b', r'\bdrop[s]?\b', r'\brally\b', r'\bslump\b',
]
_HIGHLIGHT_RE = re.compile('|'.join(_HIGHLIGHT_PATTERNS), re.IGNORECASE)


def _highlight(text: str) -> list[dict]:
    """텍스트를 분석해 {text, highlight} 세그먼트 리스트로 반환."""
    segments = []
    last = 0
    for m in _HIGHLIGHT_RE.finditer(text):
        if m.start() > last:
            segments.append({"text": text[last:m.start()], "highlight": False})
        segments.append({"text": m.group(), "highlight": True})
        last = m.end()
    if last < len(text):
        segments.append({"text": text[last:], "highlight": False})
    return segments if segments else [{"text": text, "highlight": False}]


# ── Alpha Vantage API 호출 ───────────────────────────────────────────

def _alpha_vantage_quote(ticker: str) -> dict | None:
    """현재 가격 정보"""
    try:
        resp = requests.get(
            ALPHA_VANTAGE_BASE,
            params={
                "function": "GLOBAL_QUOTE",
                "symbol": ticker,
                "apikey": settings.alpha_vantage_api_key,
            },
            timeout=10
        )
        resp.raise_for_status()
        data = resp.json()
        gq = data.get("Global Quote", {})

        if not gq or "05. price" not in gq:
            logger.warning(f"Quote API returned empty data for {ticker}: {data}")
            return None

        return {
            "price": float(gq.get("05. price", 0)),
            "prev_close": float(gq.get("08. previous close", 0)),
            "change_pct": float(gq.get("10. change percent", "0%").rstrip("%") or 0),
            "open": float(gq.get("01. open", 0)),
            "high": float(gq.get("03. high", 0)),
            "low": float(gq.get("04. low", 0)),
            "volume": int(gq.get("06. volume", 0) or 0),
        }
    except Exception as e:
        logger.error(f"Quote API error for {ticker}: {e}")
        return None


def _alpha_vantage_timeseries(ticker: str, days: int = 5) -> dict | None:
    """일봉 데이터"""
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


# ── 무버스 조회 ──────────────────────────────────────────────────────

def get_country_movers(country_code: str, db: Optional[Session] = None) -> dict:
    code = country_code.upper()

    # 1. 인메모리 캐시 우선
    cached = _cache_get(_movers_cache, code, MOVERS_TTL)
    if cached:
        return cached

    # 2. DB 캐시 확인 (1시간 이내)
    if db:
        row = db.execute(
            select(CountryMoversSnapshot).where(CountryMoversSnapshot.country_code == code)
        ).scalar_one_or_none()

        if row and (datetime.now(timezone.utc) - row.updated_at) < MOVERS_TTL:
            _cache_set(_movers_cache, code, row.data)
            return row.data

    stocks = STOCKS_BY_COUNTRY.get(code, [])
    if not stocks:
        return {"supported": False, "country_code": country_code}

    ticker_map = {s["ticker"]: s for s in stocks}
    results = []

    # 각 종목별로 Alpha Vantage Quote 호출
    for info in stocks:
        ticker = info["ticker"]
        try:
            quote = _alpha_vantage_quote(ticker)
            if not quote:
                logger.warning(f"No quote data for {ticker}")
                continue

            ts = _alpha_vantage_timeseries(ticker, days=5)
            if not ts or len(ts) < 2:
                logger.warning(f"Not enough timeseries data for {ticker}")
                continue

            # 최근 2일로 변화율 계산
            sorted_dates = sorted(ts.keys(), reverse=True)
            current = ts[sorted_dates[0]]["close"]
            prev = ts[sorted_dates[1]]["close"]
            change_pct = ((current - prev) / prev * 100) if prev else 0.0

            results.append({
                "ticker": ticker,
                "name": info["name"],
                "name_ko": info["name_ko"],
                "sector": info["sector"],
                "sector_ko": SECTORS.get(info["sector"], {}).get("ko", info["sector"]),
                "sector_color": SECTORS.get(info["sector"], {}).get("color", "#555"),
                "change_pct": round(change_pct, 2),
                "current_price": round(current, 2),
                "has_spread": ticker in TICKER_TO_SPREAD,
            })
        except Exception as e:
            logger.warning(f"Error processing {ticker}: {e}")
            continue

        time.sleep(0.25)  # Alpha Vantage 분당 5 요청 제한 (0.2초 * 5 = 1초마다 5개)

    results.sort(key=lambda x: x["change_pct"], reverse=True)

    # 섹터별 평균 등락률
    sector_groups: dict[str, list[float]] = defaultdict(list)
    for r in results:
        sector_groups[r["sector"]].append(r["change_pct"])

    leading_sector = None
    best_avg = 0.0
    for sector, vals in sector_groups.items():
        avg = sum(vals) / len(vals)
        if abs(avg) > abs(best_avg):
            best_avg = avg
            leading_sector = sector

    direction = "up" if best_avg > 0 else "down"
    sector_ko = SECTORS.get(leading_sector, {}).get("ko", leading_sector) if leading_sector else ""
    sector_color = SECTORS.get(leading_sector, {}).get("color", "#555") if leading_sector else "#555"

    if leading_sector:
        if direction == "up":
            summary_ko = f"{sector_ko} 섹터가 오늘 상승장을 이끌었습니다. ({best_avg:+.2f}%)"
            summary_en = f"{leading_sector} sector led today's gains. ({best_avg:+.2f}%)"
        else:
            summary_ko = f"{sector_ko} 섹터가 오늘 하락장을 주도했습니다. ({best_avg:+.2f}%)"
            summary_en = f"{leading_sector} sector led today's losses. ({best_avg:+.2f}%)"
    else:
        summary_ko = "오늘 두드러진 주도 섹터가 없습니다."
        summary_en = "No dominant sector today."

    data = {
        "supported": True,
        "country_code": code,
        "leading_sector": leading_sector,
        "leading_sector_ko": sector_ko,
        "leading_sector_color": sector_color,
        "leading_avg_pct": round(best_avg, 2),
        "direction": direction,
        "summary_ko": summary_ko,
        "summary_en": summary_en,
        "gainers": [r for r in results if r["change_pct"] > 0][:5],
        "losers": [r for r in reversed(results) if r["change_pct"] < 0][:5],
        "all": results,
    }

    _cache_set(_movers_cache, code, data)
    if db:
        stmt = pg_insert(CountryMoversSnapshot).values(
            country_code=code, data=data, updated_at=datetime.now(timezone.utc)
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["country_code"],
            set_={"data": stmt.excluded.data, "updated_at": stmt.excluded.updated_at}
        )
        db.execute(stmt)
        db.commit()

    return data


# ── 종목 상세 ────────────────────────────────────────────────────────

def get_stock_detail(ticker: str) -> dict:
    cached = _cache_get(_detail_cache, ticker, DETAIL_TTL)
    if cached:
        return cached

    try:
        quote = _alpha_vantage_quote(ticker)
        ts = _alpha_vantage_timeseries(ticker, days=30)

        if not quote:
            logger.warning(f"No quote data for {ticker}")
            return {"ticker": ticker, "error": "No data available"}

        # 30일 가격 이력
        history = []
        if ts:
            for date_str in sorted(ts.keys()):
                data = ts[date_str]
                history.append({
                    "date": date_str,
                    "close": round(data["close"], 4),
                    "open": round(data["open"], 4),
                    "high": round(data["high"], 4),
                    "low": round(data["low"], 4),
                    "volume": data["volume"],
                })

        # 글로벌 스프레드
        spread = TICKER_TO_SPREAD.get(ticker)

        data = {
            "ticker": ticker,
            "name": ticker,
            "sector": "",
            "industry": "",
            "current_price": round(quote["price"], 2),
            "change_pct": round(quote["change_pct"], 2),
            "market_cap": None,
            "pe_ratio": None,
            "forward_pe": None,
            "52w_high": None,
            "52w_low": None,
            "avg_volume": round(quote["volume"], 0),
            "dividend_yield": None,
            "beta": None,
            "history": history,
            "news": [],  # Alpha Vantage 무료는 뉴스 미지원
            "spread": spread,
        }

        _cache_set(_detail_cache, ticker, data)
        return data

    except Exception as e:
        stale = _detail_cache.get(ticker)
        if stale:
            logger.warning(f"Returning stale cache for {ticker} due to error: {e}")
            return stale[1]
        logger.error(f"get_stock_detail failed for {ticker}: {e}")
        return {"ticker": ticker, "error": str(e)}


# ── 전체 무버스 프리패치 (스케줄러 전용) ─────────────────────────────

def prefetch_all_movers(db: Session) -> int:
    """모든 지원 국가의 무버스 데이터를 미리 가져와 DB에 저장한다."""
    countries = list(STOCKS_BY_COUNTRY.keys())
    success = 0
    for code in countries:
        try:
            data = get_country_movers(code, db=db)
            if data.get("all"):
                success += 1
                logger.info(f"Prefetch movers OK: {code} ({len(data['all'])} stocks)")
            else:
                logger.warning(f"Prefetch movers empty: {code}")
        except Exception as e:
            logger.error(f"Prefetch movers failed for {code}: {e}")
        time.sleep(1)  # Alpha Vantage rate limit (분당 5 요청)
    logger.info(f"Movers prefetch complete: {success}/{len(countries)} countries")
    return success
