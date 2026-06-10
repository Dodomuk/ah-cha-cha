from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Integer, Float, DateTime, Date, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.models.database import Base


class JobTrend(Base):
    """IT 채용 시장 주간 트렌드 — 직군별 공고 수 + 증감률"""
    __tablename__ = "job_trends"
    __table_args__ = (UniqueConstraint("week_date", "job_category", name="uq_job_trend_week_category"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    week_date: Mapped[datetime] = mapped_column(Date, nullable=False)  # 주간 시작 날짜 (월요일)
    job_category: Mapped[str] = mapped_column(String(50), nullable=False)  # "ai_ml", "frontend", "backend", "devops", "security"
    posting_count: Mapped[int] = mapped_column(Integer, nullable=False)  # 이번 주 공고 수
    prev_week_count: Mapped[Optional[int]] = mapped_column(Integer)  # 지난주 공고 수
    change_pct: Mapped[Optional[float]] = mapped_column(Float)  # 변동률 (%)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )


class JobKeyword(Base):
    """IT 채용 시장 급상승 키워드 — 주간 트렌드"""
    __tablename__ = "job_keywords"
    __table_args__ = (UniqueConstraint("week_date", "keyword", name="uq_job_keyword_week"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    week_date: Mapped[datetime] = mapped_column(Date, nullable=False)  # 주간 시작 날짜
    keyword: Mapped[str] = mapped_column(String(100), nullable=False)  # "LLM", "RAG", "Rust" 등
    frequency: Mapped[int] = mapped_column(Integer, nullable=False)  # 공고에서 나타난 횟수
    rank: Mapped[Optional[int]] = mapped_column(Integer)  # 순위 (1위부터)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class JobSourceCache(Base):
    """사람인/원티드 API 응답 캐시 — Rate limit 방지"""
    __tablename__ = "job_source_caches"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source: Mapped[str] = mapped_column(String(50), nullable=False)  # "saramin" or "wanted"
    week_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    job_category: Mapped[str] = mapped_column(String(50), nullable=False)
    data: Mapped[dict] = mapped_column(String)  # JSON 문자열로 저장
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )
