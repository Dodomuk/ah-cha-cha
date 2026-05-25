import httpx
import feedparser
import logging
from datetime import datetime, timezone
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

SECURITY_RSS_FEEDS = [
    # 글로벌
    "https://feeds.feedburner.com/TheHackersNews",
    "https://www.bleepingcomputer.com/feed/",
    "https://krebsonsecurity.com/feed/",
    "https://www.darkreading.com/rss.xml",
    # 국내
    "https://asec.ahnlab.com/ko/feed/",
    "https://www.boannews.com/rss/news.xml",
    "https://www.dailysecu.com/rss/allArticle.xml",
]


async def fetch_security_news(limit: int = 75) -> list[dict]:
    results = []

    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        for feed_url in SECURITY_RSS_FEEDS:
            try:
                resp = await client.get(feed_url)
                resp.raise_for_status()
                feed = feedparser.parse(resp.text)

                for entry in feed.entries:
                    url = entry.get("link", "")
                    if not url:
                        continue
                    results.append({
                        "url": url,
                        "source_title": entry.get("title", ""),
                        "source_domain": _extract_domain(url),
                        "published_at": _parse_date(entry),
                    })

                logger.info(f"RSS fetched {len(feed.entries)} entries from {feed_url}")
            except Exception as e:
                logger.warning(f"RSS feed failed ({feed_url}): {e}")

    seen: set[str] = set()
    unique = []
    for a in results:
        if a["url"] not in seen:
            seen.add(a["url"])
            unique.append(a)

    return unique[:limit]


def _extract_domain(url: str) -> str:
    try:
        return urlparse(url).netloc.removeprefix("www.")
    except Exception:
        return ""


def _parse_date(entry: dict) -> datetime | None:
    for field in ("published_parsed", "updated_parsed"):
        t = entry.get(field)
        if t:
            try:
                return datetime(*t[:6], tzinfo=timezone.utc)
            except Exception:
                pass
    return None
