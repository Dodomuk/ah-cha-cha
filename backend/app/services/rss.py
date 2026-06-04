from typing import Optional
import httpx
import feedparser
import logging
from datetime import datetime, timezone
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

RSS_FEEDS = {
    # 정치/외교
    "politics": [
        "https://www.bbc.com/news/rss.xml",
        "https://feeds.reuters.com/politics",
        "https://www.politico.eu/feed/",
        "https://apnews.com/hub/politics/feed",
        "http://feeds.reuters.com/reuters/worldNews",
        "https://www.washingtonpost.com/politics/?itid=lk_inline_manual_18",
    ],
    # 전쟁/분쟁
    "conflict": [
        "https://feeds.reuters.com/reuters/worldNews",
        "https://www.bbc.com/news/world/rss.xml",
        "https://feeds.bloomberg.com/markets/news.rss",
        "https://feeds.washingtonpost.com/rss/world",
    ],
    # IT/기술
    "tech": [
        "https://news.ycombinator.com/rss",
        "https://www.theverge.com/rss/index.xml",
        "https://feeds.arstechnica.com/arstechnica/index",
        "https://techcrunch.com/feed/",
        "https://feeds.slashdot.org/Slashdot/slashdot",
        "https://www.wired.com/feed/rss",
        "https://feeds.macrumors.com/MacRumors-Front-Page/",
    ],
    # 스포츠
    "sports": [
        "http://feeds.reuters.com/reuters/sportsNews",
        "https://www.bbc.com/sport/rss.xml",
        "https://feeds.espn.com/espn/headlines",
    ],
    # 글로벌 뉴스
    "general": [
        "https://www.bbc.com/news/rss.xml",
        "http://feeds.reuters.com/reuters/worldNews",
        "https://apnews.com/apf-services/APIFeeds/rss_feed.xml",
        "http://feeds.cnn.com/rss/edition.rss",
    ],
    # 경제/금융
    "economics": [
        "https://feeds.ft.com/?format=rss",
        "https://feeds.marketwatch.com/marketwatch/topstories/",
        "https://feeds.cnbc.com/cnbc/index.html",
        "https://feeds.reuters.com/reuters/businessNews",
        "https://feeds.bloomberg.com/markets/news.rss",
    ],
    # 의료/바이오
    "healthcare": [
        "https://www.statnews.com/feed/",
        "https://connect.medrxiv.org/rss/new",
    ],
    # 환경/에너지
    "environment": [
        "https://feeds.pv-magazine.com/feed",
        "https://www.renewableenergynews.com/feed/",
    ],
    # 엔터테인먼트
    "entertainment": [
        "https://variety.com/feed/",
        "https://www.hollywoodreporter.com/feed/",
    ],
}


async def fetch_all_news(limit: int = 300) -> list[dict]:
    """모든 카테고리의 뉴스를 수집한다 (필터링 없음)."""
    results = []

    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        for category, feed_urls in RSS_FEEDS.items():
            for feed_url in feed_urls:
                try:
                    resp = await client.get(feed_url)
                    resp.raise_for_status()
                    feed = feedparser.parse(resp.text)

                    for entry in feed.entries:
                        url = entry.get("link", "")
                        title = entry.get("title", "")
                        if not url or not title:
                            continue
                        results.append({
                            "url": url,
                            "source_title": title,
                            "source_domain": _extract_domain(url),
                            "published_at": _parse_date(entry),
                            "category": category,
                        })

                    logger.info(
                        f"RSS {category} {feed_url}: {len(feed.entries)} entries"
                    )
                except Exception as e:
                    logger.warning(f"RSS feed failed ({feed_url}): {e}")

    seen: set[str] = set()
    unique = []
    for a in results:
        if a["url"] not in seen:
            seen.add(a["url"])
            unique.append(a)

    logger.info(f"Total articles from all sources: {len(unique)}")
    return unique[:limit]


async def _fetch_news_by_category(
    category: str, limit: int = 200, filter_func=None
) -> list[dict]:
    """특정 카테고리의 뉴스를 수집한다."""
    results = []
    feed_urls = RSS_FEEDS.get(category, [])

    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        for feed_url in feed_urls:
            try:
                resp = await client.get(feed_url)
                resp.raise_for_status()
                feed = feedparser.parse(resp.text)

                passed = 0
                for entry in feed.entries:
                    url = entry.get("link", "")
                    title = entry.get("title", "")
                    if not url:
                        continue
                    if filter_func and not filter_func(title):
                        continue
                    results.append({
                        "url": url,
                        "source_title": title,
                        "source_domain": _extract_domain(url),
                        "published_at": _parse_date(entry),
                        "category": category,
                    })
                    passed += 1

                logger.info(
                    f"RSS {category} {feed_url}: {len(feed.entries)} entries → "
                    f"{passed} selected"
                )
            except Exception as e:
                logger.warning(f"RSS feed failed ({feed_url}): {e}")

    seen: set[str] = set()
    unique = []
    for a in results:
        if a["url"] not in seen:
            seen.add(a["url"])
            unique.append(a)

    logger.info(f"Total {category} articles after filter: {len(unique)}")
    return unique[:limit]


def _extract_domain(url: str) -> str:
    try:
        return urlparse(url).netloc.removeprefix("www.")
    except Exception:
        return ""


def _parse_date(entry: dict) -> Optional[datetime]:
    for field in ("published_parsed", "updated_parsed"):
        t = entry.get(field)
        if t:
            try:
                return datetime(*t[:6], tzinfo=timezone.utc)
            except Exception:
                pass
    return None
