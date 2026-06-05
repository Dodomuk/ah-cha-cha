from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Text, DateTime, BigInteger, Index
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.models.database import Base


class StockMetadata(Base):
    """종목 기본 정보 (시총 상위 100개)"""
    __tablename__ = "stock_metadata"

    id: Mapped[int] = mapped_column(primary_key=True)
    symbol: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    name_ko: Mapped[str] = mapped_column(String(100), nullable=False)     # "삼성전자"
    name_en: Mapped[Optional[str]] = mapped_column(String(100))           # "Samsung Electronics"
    sector: Mapped[Optional[str]] = mapped_column(String(50))             # "반도체"
    market: Mapped[str] = mapped_column(String(20), nullable=False)       # "KOSPI" or "KOSDAQ"
    market_cap_rank: Mapped[Optional[int]] = mapped_column()              # 시총 순위
    last_update: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        Index('idx_symbol', 'symbol'),
        Index('idx_sector', 'sector'),
    )


class StockNews(Base):
    """주식 관련 뉴스"""
    __tablename__ = "stock_news"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # 기본 정보
    url: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    source_title: Mapped[str] = mapped_column(Text, nullable=False)        # 원본 뉴스 제목
    source_domain: Mapped[Optional[str]] = mapped_column(String(255))      # "news.naver.com"
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # 관련 종목
    related_symbols: Mapped[Optional[list[str]]] = mapped_column(Text)     # JSON: ["005930", "000270"]
    main_symbol: Mapped[Optional[str]] = mapped_column(String(20))         # 주 종목
    sector: Mapped[Optional[str]] = mapped_column(String(50))              # 섹터 태깅

    # 요약 (API 비용 절감용)
    summary_title: Mapped[Optional[str]] = mapped_column(Text)             # 한국어 한줄 요약
    summary_body: Mapped[Optional[str]] = mapped_column(Text)              # 한국어 3줄 요약

    # AI 처리 여부
    ai_processed: Mapped[bool] = mapped_column(default=False)

    # 메타
    collected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        Index('idx_url', 'url'),
        Index('idx_symbol', 'main_symbol'),
        Index('idx_collected_at', 'collected_at'),
        Index('idx_processed', 'ai_processed'),
    )
