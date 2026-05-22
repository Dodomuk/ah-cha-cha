import httpx
import logging
from datetime import datetime, timezone
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

SECURITY_KEYWORDS = [
    "cyber attack", "cyberattack", "data breach", "ransomware", "hacking", "hacked",
    "security breach", "malware", "phishing", "vulnerability", "exploit",
    "ddos", "zero-day", "zero day", "botnet", "spyware", "trojan",
    "cybercrime", "cybersecurity incident", "information security",
    "network intrusion", "credential theft", "supply chain attack",
]

GDELT_DOC_API = "https://api.gdeltproject.org/api/v2/doc/doc"


async def fetch_security_news(limit: int = 75) -> list[dict]:
    query = "(" + " OR ".join(f'"{kw}"' for kw in SECURITY_KEYWORDS[:8]) + ")"
    params = {
        "query": query,
        "mode": "artlist",
        "maxrecords": limit,
        "sort": "DateDesc",
        "format": "json",
        "timespan": "2h",
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(GDELT_DOC_API, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.error(f"GDELT fetch failed: {e}")
        return []

    articles = data.get("articles", [])
    results = []

    for article in articles:
        url = article.get("url", "")
        if not url:
            continue

        domain = _extract_domain(url)
        published_at = _parse_date(article.get("seendate", ""))

        results.append({
            "url": url,
            "source_title": article.get("title", ""),
            "source_domain": domain,
            "published_at": published_at,
        })

    return results


def _extract_domain(url: str) -> str:
    try:
        return urlparse(url).netloc.removeprefix("www.")
    except Exception:
        return ""


def _parse_date(date_str: str) -> datetime | None:
    # GDELT 형식: "20240521T120000Z"
    try:
        return datetime.strptime(date_str, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
    except Exception:
        return None
