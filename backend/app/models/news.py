from datetime import datetime, timezone
from sqlalchemy import String, Text, SmallInteger, Boolean, ARRAY, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.models.database import Base


class NewsArticle(Base):
    __tablename__ = "news_articles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    url: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    source_title: Mapped[str | None] = mapped_column(Text)
    source_domain: Mapped[str | None] = mapped_column(String(255))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    collected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    summary_title: Mapped[str | None] = mapped_column(Text)
    summary_what: Mapped[str | None] = mapped_column(Text)
    summary_impact: Mapped[str | None] = mapped_column(Text)
    threat_level: Mapped[int] = mapped_column(SmallInteger, default=0)
    country_codes: Mapped[list[str] | None] = mapped_column(ARRAY(String(10)))

    ai_processed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class CountryThreatLevel(Base):
    __tablename__ = "country_threat_levels"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    country_code: Mapped[str] = mapped_column(String(2), nullable=False)
    threat_level: Mapped[int] = mapped_column(SmallInteger, default=0)
    article_count: Mapped[int] = mapped_column(default=0)
    snapshot_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
