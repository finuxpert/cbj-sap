from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return uuid4().hex


class Base(DeclarativeBase):
    pass


class Case(Base):
    __tablename__ = "cases"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    case_no: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    sid: Mapped[str] = mapped_column(String(40), default="", index=True)
    environment: Mapped[str] = mapped_column(String(80), default="")
    severity: Mapped[str] = mapped_column(String(20), default="INFO", index=True)
    status: Mapped[str] = mapped_column(String(20), default="OPEN", index=True)
    case_stage: Mapped[str] = mapped_column(String(40), default="INTAKE", index=True)
    summary: Mapped[str] = mapped_column(Text, default="")
    top_anomaly: Mapped[str] = mapped_column(Text, default="")
    top_suspect: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[str] = mapped_column(String(120), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, index=True)

    evidence: Mapped[list[Evidence]] = relationship(back_populates="case", cascade="all, delete-orphan")  # type: ignore[name-defined]
    parsed_results: Mapped[list[ParsedResult]] = relationship(back_populates="case", cascade="all, delete-orphan")  # type: ignore[name-defined]
    reports: Mapped[list[Report]] = relationship(back_populates="case", cascade="all, delete-orphan")  # type: ignore[name-defined]
    audit_logs: Mapped[list[AuditLog]] = relationship(back_populates="case", cascade="all, delete-orphan")  # type: ignore[name-defined]


class Evidence(Base):
    __tablename__ = "evidence"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    case_id: Mapped[str | None] = mapped_column(String(80), ForeignKey("cases.id", ondelete="SET NULL"), nullable=True, index=True)
    tool: Mapped[str] = mapped_column(String(80), default="unknown", index=True)
    sid: Mapped[str] = mapped_column(String(40), default="", index=True)
    title: Mapped[str] = mapped_column(String(255), default="")
    original_filename: Mapped[str] = mapped_column(String(255), default="")
    stored_filename: Mapped[str] = mapped_column(String(255), default="")
    stored_path: Mapped[str] = mapped_column(Text, default="")
    checksum_sha256: Mapped[str] = mapped_column(String(64), default="", index=True)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    mime_type: Mapped[str] = mapped_column(String(120), default="")
    ext: Mapped[str] = mapped_column(String(20), default="")
    note: Mapped[str] = mapped_column(Text, default="")
    tags: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    case: Mapped[Case | None] = relationship(back_populates="evidence")


class ParsedResult(Base):
    __tablename__ = "parsed_results"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    case_id: Mapped[str] = mapped_column(String(80), ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    evidence_id: Mapped[str | None] = mapped_column(String(64), ForeignKey("evidence.id", ondelete="SET NULL"), nullable=True, index=True)
    tool: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    parser_version: Mapped[str] = mapped_column(String(80), default="")
    verdict: Mapped[str] = mapped_column(String(80), default="")
    severity: Mapped[str] = mapped_column(String(20), default="INFO", index=True)
    confidence: Mapped[float] = mapped_column(Float, default=0)
    top_anomaly: Mapped[str] = mapped_column(Text, default="")
    top_suspect: Mapped[str] = mapped_column(Text, default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    result_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    case: Mapped[Case] = relationship(back_populates="parsed_results")


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    case_id: Mapped[str] = mapped_column(String(80), ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    report_type: Mapped[str] = mapped_column(String(80), default="pdf")
    file_path: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    case: Mapped[Case] = relationship(back_populates="reports")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    case_id: Mapped[str | None] = mapped_column(String(80), ForeignKey("cases.id", ondelete="SET NULL"), nullable=True, index=True)
    actor: Mapped[str] = mapped_column(String(120), default="")
    action: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(String(80), default="")
    target_id: Mapped[str] = mapped_column(String(120), default="")
    detail_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    case: Mapped[Case | None] = relationship(back_populates="audit_logs")


class CaseAnalyticsCache(Base):
    __tablename__ = "case_analytics_cache"

    case_id: Mapped[str] = mapped_column(String(80), ForeignKey("cases.id", ondelete="CASCADE"), primary_key=True)
    analytics_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, index=True)
