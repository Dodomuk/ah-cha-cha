from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class NewsArticleOut(BaseModel):
    id: UUID
    summary_title: str | None
    summary_what: str | None
    summary_impact: str | None
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
