from typing import Optional
import httpx
import feedparser
import logging
from datetime import datetime, timezone
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

RSS_FEEDS = {
    # AI/머신러닝
    "ai": [
        "https://news.ycombinator.com/rss",
        "https://www.theverge.com/rss/index.xml",
        "https://feeds.arstechnica.com/arstechnica/index",
        "https://techcrunch.com/feed/",
        "https://www.wired.com/feed/rss",
        "https://arxiv.org/list/cs.AI/rss",
    ],
    # 빅테크 (Google, Meta, Apple, Amazon, Microsoft)
    "bigtech": [
        "https://feeds.macrumors.com/MacRumors-Front-Page/",
        "https://feeds.arstechnica.com/arstechnica/index",
        "https://www.theverge.com/rss/index.xml",
        "https://techcrunch.com/feed/",
    ],
    # 개발 (프로그래밍, 도구, 라이브러리)
    "development": [
        "https://news.ycombinator.com/rss",
        "https://feeds.arstechnica.com/arstechnica/index",
        "https://feeds.slashdot.org/Slashdot/slashdot",
        "https://www.infoq.com/feed/",
        "https://techcrunch.com/feed/",
    ],
    # 스타트업 (창업, 펀딩, 인수합병)
    "startup": [
        "https://techcrunch.com/feed/",
        "https://news.ycombinator.com/rss",
        "https://feeds.bloomberg.com/markets/news.rss",
        "https://www.theverge.com/rss/index.xml",
    ],
    # 보안 (사이버보안, 개인정보)
    "security": [
        "https://feeds.arstechnica.com/arstechnica/index",
        "https://feeds.slashdot.org/Slashdot/slashdot",
        "https://www.darkreading.com/feeds/",
        "https://www.wired.com/feed/rss",
        "https://krebsonsecurity.com/feed/",
    ],
}


async def fetch_all_news(limit: int = 300) -> list[dict]:
    """IT 관련 뉴스만 수집한다 (AI, 빅테크, 개발, 스타트업, 보안)."""
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
