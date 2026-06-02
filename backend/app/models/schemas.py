from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class NewsArticleOut(BaseModel):
    id: UUID
    source_title: str | None = None   # 원문 제목 (프론트 중복 그룹화에 사용)
    summary_title: str | None
    summary_what: str | None
    summary_impact: str | None
    summary_title_en: str | None = None
    summary_what_en: str | None = None
    summary_impact_en: str | None = None
    threat_level: int
    url: str
    source_domain: str | None
    published_at: datetime | None
    collected_at: datetime
    attacker_codes: list[str] | None = None
    victim_codes: list[str] | None = None

    model_config = {"from_attributes": True}


class CountryThreatOut(BaseModel):
    threat_level: int
    article_count: int
    delta: int | None = None
    role: str | None = None


class CountriesResponse(BaseModel):
    snapshot_at: datetime
    countries: dict[str, CountryThreatOut]


class CountryNewsResponse(BaseModel):
    country_code: str
    threat_level: int
    articles: list[NewsArticleOut]


class LatestNewsResponse(BaseModel):
    articles: list[NewsArticleOut]


class StatsResponse(BaseModel):
    total_7d: int
    today: int
    by_level: dict[str, int]  # "1"~"4" → 건수


class TrendPoint(BaseModel):
    date: str
    level: int


class TrendResponse(BaseModel):
    points: list[TrendPoint]


class SearchResponse(BaseModel):
    articles: list[NewsArticleOut]
    query: str


# ── 증시 ────────────────────────────────────────────────────────────

class MarketSnapshotOut(BaseModel):
    country_code: str
    index_name: str
    index_name_ko: str
    ticker: str
    current_value: float | None
    prev_close: float | None
    change_pct: float | None
    change_abs: float | None
    is_open: bool
    updated_at: datetime

    model_config = {"from_attributes": True}


class MarketsResponse(BaseModel):
    markets: dict[str, MarketSnapshotOut]   # country_code → snapshot
    updated_at: datetime


class HistoryPoint(BaseModel):
    date: str       # YYYY-MM-DD
    close: float | None


class CountryMarketDetail(BaseModel):
    snapshot: MarketSnapshotOut
    history: list[HistoryPoint]  # 최근 30일
