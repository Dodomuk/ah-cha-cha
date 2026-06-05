"""
주식 뉴스 수집 및 처리 (비용 최적화 버전)

수집 전략:
1. 종목명 기반 검색 (전체 긁고 필터링 ❌)
2. URL 중복 체크 + 30분 내 유사 제목 제거
3. 뉴스 텍스트 300자 제한 + 배치 처리
"""

import re
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import select, func, delete
import httpx

from app.models.stock_news import StockNews, StockMetadata
from app.config import settings

logger = logging.getLogger(__name__)

# 주요 뉴스 소스 (한국 주식 뉴스)
NEWS_SOURCES = {
    "naver": "https://news.naver.com/main/list.nhn",
    "daum": "https://news.daum.net/",
    "yonhapnews": "https://www.yna.co.kr/",
    "moneyt": "https://www.moneytodayc.com/",
    "sedaily": "https://www.sedaily.com/",
    "fnnews": "https://www.fnnews.com/",
}

# 수집할 섹터 (10개)
TARGET_SECTORS = [
    "반도체",           # 삼성전자, SK하이닉스
    "2차전지",          # LG에너지솔루션, SK이노베이션
    "바이오",           # 셀트리온, 삼성바이오로직스
    "금융",             # 삼성증권, KB금융
    "자동차",           # 현대차, 기아
    "조선",             # 현대중공업
    "건설",             # 현대건설, GS건설
    "화학",             # SK케미칼, 롯데케미칼
    "식음료",           # 농심, 오뚜기
    "미디어",           # CJ ENM
]


def _title_words(title: str) -> set[str]:
    """제목에서 의미있는 단어 추출 (2자 이상)"""
    return {w for w in re.sub(r'[^\w\s]', '', title.lower()).split() if len(w) >= 2}


def _are_similar_titles(t1: str, t2: str, threshold: float = 0.6) -> bool:
    """Jaccard 유사도로 제목 비교"""
    w1, w2 = _title_words(t1), _title_words(t2)
    if len(w1) < 2 or len(w2) < 2:
        return False
    union = w1 | w2
    return len(w1 & w2) / len(union) >= threshold if union else False


async def fetch_stock_news(symbol: str, limit: int = 30) -> list[dict]:
    """
    종목명 기반 뉴스 검색 (Naver/Daum API 사용)

    실제 구현에서는 다음 API 사용:
    - Naver News API (요청 필요)
    - NewsAPI (국내 뉴스 제한적)
    - 웹 크롤링 (robots.txt 준수)

    지금은 mock 데이터 반환
    """
    logger.info(f"Fetching news for symbol: {symbol}")

    # TODO: 실제 API 연동
    # 임시로 빈 리스트 반환
    return []


async def collect_stock_news(db: Session, symbols: Optional[list[str]] = None) -> int:
    """
    주식 뉴스 수집 (최적화된 버전)

    1. 시총 상위 100개 종목 또는 지정된 symbols로 뉴스 검색
    2. URL 중복 체크
    3. 30분 내 유사 제목 제거
    4. DB에 저장 (AI 처리 대기)

    Args:
        db: SQLAlchemy Session
        symbols: 특정 종목만 수집하려면 리스트 전달. None이면 상위 100개 모두.
    """

    # 1. 수집할 종목 목록 결정
    if symbols is None:
        # 시총 상위 100개 조회
        query = select(StockMetadata.symbol).order_by(
            StockMetadata.market_cap_rank
        ).limit(100)
        symbols = db.execute(query).scalars().all()

    if not symbols:
        logger.warning("No symbols to collect")
        return 0

    logger.info(f"Collecting news for {len(symbols)} symbols")

    # 2. 각 종목별 뉴스 수집
    all_articles = []
    for symbol in symbols:
        try:
            articles = await fetch_stock_news(symbol)
            all_articles.extend(articles)
        except Exception as e:
            logger.warning(f"Failed to fetch news for {symbol}: {e}")

    if not all_articles:
        logger.info("No articles fetched")
        return 0

    # 3. URL 중복 체크
    urls = [a["url"] for a in all_articles]
    existing = db.execute(
        select(StockNews.url).where(StockNews.url.in_(urls))
    ).scalars().all()
    existing_set = set(existing)

    new_articles = [a for a in all_articles if a["url"] not in existing_set]
    logger.info(f"New articles: {len(new_articles)}/{len(all_articles)} (dudup by URL)")

    if not new_articles:
        return 0

    # 4. 30분 내 유사 제목 제거
    thirty_min_ago = datetime.now(timezone.utc) - timedelta(minutes=30)
    recent_articles = db.execute(
        select(StockNews.source_title, StockNews.main_symbol)
        .where(StockNews.collected_at >= thirty_min_ago)
    ).all()

    filtered = []
    for article in new_articles:
        title = article.get("source_title", "")
        symbol = article.get("main_symbol")

        # 같은 종목 + 30분 내 + 유사 제목이면 스킵
        is_duplicate = False
        for existing_title, existing_symbol in recent_articles:
            if symbol == existing_symbol and _are_similar_titles(title, existing_title):
                is_duplicate = True
                break

        if not is_duplicate:
            filtered.append(article)

    logger.info(f"After title dedup: {len(filtered)} articles (removed {len(new_articles) - len(filtered)})")

    # 5. DB에 저장
    saved = 0
    for article in filtered:
        try:
            # 뉴스 텍스트 300자로 제한 (API 비용 절감)
            # 실제 뉴스 본문이 저장되면 여기서 자르기

            obj = StockNews(
                url=article["url"],
                source_title=article.get("source_title", ""),
                source_domain=article.get("source_domain"),
                published_at=article.get("published_at"),
                related_symbols=json.dumps(article.get("related_symbols", [])),
                main_symbol=article.get("main_symbol"),
                sector=article.get("sector"),
                ai_processed=False,
            )
            db.add(obj)
            saved += 1
        except Exception as e:
            logger.error(f"Failed to save article: {e}")

    db.commit()
    logger.info(f"Saved {saved} new stock news articles")

    return saved


async def summarize_stock_news_batch(db: Session, limit: int = 10) -> dict:
    """
    ai_processed=False 뉴스들을 배치로 Claude API에 전달

    배치 처리: 10건씩 모아서 1회 호출 (API 비용 절감)
    """

    pending = db.execute(
        select(StockNews)
        .where(StockNews.ai_processed.is_(False))
        .order_by(StockNews.collected_at.desc())
        .limit(limit)
    ).scalars().all()

    if not pending:
        logger.info("No pending stock news to summarize")
        return {"summarized": 0, "cost_usd": 0}

    logger.info(f"Summarizing {len(pending)} stock news articles...")

    # TODO: Claude API 호출 (배치)
    # from app.services.summarizer import summarize_batch
    # processed, tokens = await summarize_batch(articles_data)

    # 지금은 mock 처리
    summarized = 0

    for article in pending:
        article.ai_processed = True
        summarized += 1

    db.commit()
    logger.info(f"Summarized {summarized} articles")

    return {"summarized": summarized, "cost_usd": 0}


async def cleanup_old_news(db: Session, days: int = 7) -> int:
    """
    7일 이상 된 뉴스는 삭제 (스토리지 절감)
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    deleted = db.execute(
        delete(StockNews).where(StockNews.collected_at < cutoff)
    ).rowcount
    db.commit()

    logger.info(f"Deleted {deleted} old stock news articles (>= {days} days)")
    return deleted
