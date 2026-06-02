"""yfinance로 국가별 주요 종목 무버스, 뉴스, 상세 데이터를 수집한다."""

import logging
import re
from datetime import datetime, timezone, timedelta
from collections import defaultdict

import yfinance as yf

from app.services.stock_config import STOCKS_BY_COUNTRY, SECTORS, TICKER_TO_SPREAD

logger = logging.getLogger(__name__)

# ── 인메모리 캐시 ────────────────────────────────────────────────────
_movers_cache: dict[str, tuple[datetime, dict]] = {}
_detail_cache: dict[str, tuple[datetime, dict]] = {}
MOVERS_TTL = timedelta(minutes=15)
DETAIL_TTL = timedelta(minutes=10)


def _cache_get(cache: dict, key: str, ttl: timedelta):
    entry = cache.get(key)
    if entry and datetime.now(timezone.utc) - entry[0] < ttl:
        return entry[1]
    return None


def _cache_set(cache: dict, key: str, value: dict):
    cache[key] = (datetime.now(timezone.utc), value)


# ── 뉴스 키워드 ──────────────────────────────────────────────────────
_HIGHLIGHT_PATTERNS = [
    # 실적/재무
    r'\bearnings?\b', r'\brevenue\b', r'\bprofit\b', r'\bEPS\b', r'\bbeat\b', r'\bmiss\b',
    r'\bguidance\b', r'\boutlook\b', r'\bforecast\b', r'\bdividend\b',
    # 이벤트
    r'\bacquisition\b', r'\bmerger\b', r'\bIPO\b', r'\bbuyback\b', r'\blayoff[s]?\b',
    r'\brecall\b', r'\blawsuit\b', r'\bfine\b', r'\bpenalty\b',
    # 기술/산업
    r'\bAI\b', r'\bsemiconductor\b', r'\bchip[s]?\b', r'\bEV\b', r'\bbattery\b',
    r'\bcloud\b', r'\bdata center\b', r'\b5G\b', r'\bsupply chain\b',
    # 거시
    r'\bFed\b', r'\binterest rate[s]?\b', r'\binflation\b', r'\btariff[s]?\b',
    r'\bsanction[s]?\b', r'\brecession\b',
    # 방향
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


# ── 무버스 조회 ──────────────────────────────────────────────────────

def get_country_movers(country_code: str) -> dict:
    cached = _cache_get(_movers_cache, country_code, MOVERS_TTL)
    if cached:
        return cached

    stocks = STOCKS_BY_COUNTRY.get(country_code.upper(), [])
    if not stocks:
        return {"supported": False, "country_code": country_code}

    tickers = [s["ticker"] for s in stocks]
    ticker_map = {s["ticker"]: s for s in stocks}

    try:
        # 한 번의 배치 다운로드로 Rate Limit 방지
        raw = yf.download(
            tickers, period="5d", interval="1d",
            auto_adjust=True, progress=False, group_by="ticker",
        )
    except Exception as e:
        logger.error(f"Batch download failed for {country_code}: {e}")
        return {"supported": True, "error": str(e), "gainers": [], "losers": [], "all": []}

    if raw.empty:
        logger.warning(f"Batch download returned empty data for {country_code}")
        return {"supported": True, "gainers": [], "losers": [], "all": []}

    results = []
    for info in stocks:
        ticker = info["ticker"]
        try:
            # 단일 티커면 flat columns, 복수면 MultiIndex (ticker, OHLC)
            if len(tickers) == 1:
                df = raw
            else:
                # group_by="ticker" → MultiIndex: (ticker, column)
                try:
                    df = raw[ticker]
                except (KeyError, TypeError):
                    logger.warning(f"No data returned for {ticker}")
                    continue

            if df is None or df.empty:
                logger.warning(f"Empty dataframe for {ticker}")
                continue

            # Close 컬럼 추출
            try:
                closes = df["Close"].dropna()
            except KeyError:
                logger.warning(f"No Close column for {ticker}")
                continue

            if len(closes) < 2:
                continue

            current = float(closes.iloc[-1])
            prev = float(closes.iloc[-2])
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

    results.sort(key=lambda x: x["change_pct"], reverse=True)

    # 섹터별 평균 등락률 → 주도 섹터
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
        "country_code": country_code,
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

    _cache_set(_movers_cache, country_code, data)
    return data


# ── 종목 상세 ────────────────────────────────────────────────────────

def get_stock_detail(ticker: str) -> dict:
    # 캐시 우선 반환
    cached = _cache_get(_detail_cache, ticker, DETAIL_TTL)
    if cached:
        return cached

    try:
        t = yf.Ticker(ticker)
        info = t.info or {}
    except Exception as e:
        # Rate Limit 에러 시 캐시된 데이터라도 반환 (TTL 무시)
        stale = _detail_cache.get(ticker)
        if stale:
            logger.warning(f"Returning stale cache for {ticker} due to error: {e}")
            return stale[1]
        logger.error(f"get_stock_detail failed for {ticker}: {e}")
        return {"ticker": ticker, "error": str(e)}

    try:

        # 30일 가격 이력
        hist = t.history(period="30d", interval="1d", auto_adjust=True)
        history = []
        if not hist.empty:
            for ts, row in hist.iterrows():
                close_val = row["Close"]
                if hasattr(close_val, "item"):
                    close_val = close_val.item()
                history.append({
                    "date": ts.strftime("%Y-%m-%d"),
                    "close": round(float(close_val), 4) if close_val == close_val else None,
                    "open": round(float(row["Open"]), 4) if "Open" in row else None,
                    "high": round(float(row["High"]), 4) if "High" in row else None,
                    "low": round(float(row["Low"]), 4) if "Low" in row else None,
                    "volume": int(row["Volume"]) if "Volume" in row else None,
                })

        # 뉴스 (최대 8개)
        news_raw = []
        try:
            news_raw = t.news[:8] if t.news else []
        except Exception:
            pass

        news = []
        for n in news_raw:
            title = n.get("title", "")
            if not title:
                continue
            news.append({
                "title": title,
                "segments": _highlight(title),
                "link": n.get("link", ""),
                "publisher": n.get("publisher", ""),
                "published_at": n.get("providerPublishTime", 0),
            })

        # 글로벌 스프레드
        spread = TICKER_TO_SPREAD.get(ticker)

        # 핵심 지표
        def safe(key, default=None):
            v = info.get(key, default)
            return v if v is not None and v != "N/A" else default

        data = {
            "ticker": ticker,
            "name": safe("longName") or safe("shortName") or ticker,
            "sector": safe("sector", ""),
            "industry": safe("industry", ""),
            "current_price": safe("currentPrice") or safe("regularMarketPrice"),
            "change_pct": safe("regularMarketChangePercent"),
            "market_cap": safe("marketCap"),
            "pe_ratio": safe("trailingPE"),
            "forward_pe": safe("forwardPE"),
            "52w_high": safe("fiftyTwoWeekHigh"),
            "52w_low": safe("fiftyTwoWeekLow"),
            "avg_volume": safe("averageVolume"),
            "dividend_yield": safe("dividendYield"),
            "beta": safe("beta"),
            "history": history,
            "news": news,
            "spread": spread,
        }

        _cache_set(_detail_cache, ticker, data)
        return data

    except Exception as inner_e:
        # 처리 중 에러 — 캐시가 있으면 그것이라도 반환
        stale = _detail_cache.get(ticker)
        if stale:
            logger.warning(f"Returning stale cache for {ticker} due to processing error: {inner_e}")
            return stale[1]
        logger.error(f"get_stock_detail processing failed for {ticker}: {inner_e}")
        return {"ticker": ticker, "error": str(inner_e)}
