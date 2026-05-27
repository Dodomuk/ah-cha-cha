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


def _is_security_related(title: str) -> bool:
    lower = title.lower()
    return any(kw in lower for kw in SECURITY_KEYWORDS)


async def fetch_security_news(limit: int = 200) -> list[dict]:
    """모든 피드를 전량 수집한 뒤 보안 키워드 기준으로 필터링한다.
    limit은 안전망 상한선 (키워드 필터 후에도 비정상적으로 많을 때 대비)."""
    results = []

    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        for feed_url in SECURITY_RSS_FEEDS:
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
                    if not _is_security_related(title):
                        continue
                    results.append({
                        "url": url,
                        "source_title": title,
                        "source_domain": _extract_domain(url),
                        "published_at": _parse_date(entry),
                    })
                    passed += 1

                logger.info(
                    f"RSS {feed_url}: {len(feed.entries)} entries → "
                    f"{passed} passed keyword filter"
                )
            except Exception as e:
                logger.warning(f"RSS feed failed ({feed_url}): {e}")

    seen: set[str] = set()
    unique = []
    for a in results:
        if a["url"] not in seen:
            seen.add(a["url"])
            unique.append(a)

    logger.info(f"Total security articles after filter: {len(unique)}")
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
