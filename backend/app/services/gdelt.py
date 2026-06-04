from typing import Optional
from datetime import datetime, timezone
from urllib.parse import urlparse

logger = None  # Legacy file, no longer used


def _extract_domain(url: str) -> str:
    try:
        return urlparse(url).netloc.removeprefix("www.")
    except Exception:
        return ""


def _parse_date(date_str: str) -> Optional[datetime]:
    # GDELT 형식: "20240521T120000Z"
    try:
        return datetime.strptime(date_str, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
    except Exception:
        return None
