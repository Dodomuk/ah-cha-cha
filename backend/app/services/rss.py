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
}

# 제목에 아래 키워드 중 하나라도 포함되면 수집 대상
SECURITY_KEYWORDS = {
    # ── 기본 공격/침해 ──────────────────────────────────────────
    "ransomware", "malware", "breach", "hack", "hacked", "hacking",
    "vulnerability", "cve", "exploit", "exploited", "phishing",
    "ddos", "attack", "cyber", "threat", "zero-day", "0-day",
    "backdoor", "botnet", "apt", "data leak", "data theft",
    "supply chain", "trojan", "spyware", "keylogger", "rootkit",
    "credential", "bypass", "injection", "xss", "rce",
    "remote code", "privilege escalation", "lateral movement",
    "nation-state", "critical infrastructure", "industrial control",

    # ── 추가 공격 기법 ───────────────────────────────────────────
    "wiper", "infostealer", "stealer", "cryptojacking", "cryptominer",
    "skimmer", "bec", "smishing", "vishing", "spear-phishing", "spear phishing",
    "watering hole", "account takeover", "credential stuffing",
    "dark web", "darknet", "darkweb", "espionage", "surveillance",
    "scada", "ics", "ss7",

    # ── 취약점/패치 ──────────────────────────────────────────────
    "patch", "security update", "emergency patch", "patch tuesday",
    "proof-of-concept", "poc exploit", "cvss", "advisory",
    "memory corruption", "buffer overflow", "use-after-free", "ssrf",
    "leaked", "exposed", "compromised", "hijacked", "infected", "stolen",

    # ── 위협 행위자/그룹 ─────────────────────────────────────────
    "lazarus", "kimsuky", "andariel", "volt typhoon", "salt typhoon",
    "sandworm", "fancy bear", "cozy bear", "nobelium", "charming kitten",
    "mustang panda", "threat actor", "threat group",

    # ── 클라우드/설정 오류 ────────────────────────────────────────
    "s3 bucket", "misconfiguration", "cloud breach", "cloud credentials",
    "exposed bucket", "azure ad", "google cloud",

    # ── 금융/암호화폐 추가 ────────────────────────────────────────
    "crypto", "bitcoin theft", "exchange hack", "defi exploit",
    "wire fraud", "bec attack",

    # ── 모바일 플랫폼 ────────────────────────────────────────────
    "android", "ios", "iphone", "ipad", "mobile malware", "mobile threat",
    "mobile security", "smartphone",

    # ── 모바일 앱/스토어 ─────────────────────────────────────────
    "apk", "google play", "play store", "malicious app", "fake app",
    "trojanized app", "sideload", "testflight",

    # ── 모바일 특화 공격 ─────────────────────────────────────────
    "zero-click", "zero click", "pegasus", "stalkerware",
    "sim swap", "sim swapping", "sim hijack",
    "imsi", "stingray", "baseband",
    "webkit", "jailbreak", "rooting",
    "mdm bypass", "clipper malware", "banking trojan",
    "overlay attack", "push bombing", "mfa fatigue",
    "nfc attack", "bluetooth exploit",
    "adware", "dropper",

    # ── 국문 기본 ────────────────────────────────────────────────
    "랜섬웨어", "악성코드", "해킹", "해커", "취약점", "침해",
    "피싱", "사이버", "보안", "위협", "공격", "유출", "침투",
    "백도어", "봇넷", "스파이웨어", "크리덴셜", "정보탈취",
    "디도스", "제로데이", "원격코드실행",
    "권한상승", "공급망", "국가배후", "기반시설",

    # ── 국문 추가 ────────────────────────────────────────────────
    "스미싱", "보이스피싱", "큐싱", "스피어피싱",
    "개인정보", "정보유출", "계정탈취", "탈취",
    "다크웹", "사칭", "암호화폐", "가상자산", "내부자",
    "패치", "보안패치", "긴급패치",

    # ── 국문 모바일 ──────────────────────────────────────────────
    "모바일", "스마트폰", "악성앱", "문자사기",
    "심스와핑", "소액결제 사기", "원격제어앱",
    "페가수스", "앱스토어 악성", "구글플레이 악성",
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


def _parse_date(entry: dict) -> datetime | None:
    for field in ("published_parsed", "updated_parsed"):
        t = entry.get(field)
        if t:
            try:
                return datetime(*t[:6], tzinfo=timezone.utc)
            except Exception:
                pass
    return None
