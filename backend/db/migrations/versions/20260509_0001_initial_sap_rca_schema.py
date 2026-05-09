"""Initial SAP RCA database schema

Revision ID: 20260509_0001
Revises:
Create Date: 2026-05-09
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260509_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cases",
        sa.Column("id", sa.String(length=80), primary_key=True),
        sa.Column("case_no", sa.String(length=80), nullable=False, unique=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("sid", sa.String(length=40), nullable=False, server_default=""),
        sa.Column("environment", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("severity", sa.String(length=20), nullable=False, server_default="INFO"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="OPEN"),
        sa.Column("summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("top_anomaly", sa.Text(), nullable=False, server_default=""),
        sa.Column("top_suspect", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_by", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_cases_case_no", "cases", ["case_no"])
    op.create_index("ix_cases_sid", "cases", ["sid"])
    op.create_index("ix_cases_severity", "cases", ["severity"])
    op.create_index("ix_cases_status", "cases", ["status"])
    op.create_index("ix_cases_created_at", "cases", ["created_at"])
    op.create_index("ix_cases_updated_at", "cases", ["updated_at"])

    op.create_table(
        "evidence",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("case_id", sa.String(length=80), sa.ForeignKey("cases.id", ondelete="SET NULL"), nullable=True),
        sa.Column("tool", sa.String(length=80), nullable=False, server_default="unknown"),
        sa.Column("sid", sa.String(length=40), nullable=False, server_default=""),
        sa.Column("title", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("original_filename", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("stored_filename", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("stored_path", sa.Text(), nullable=False, server_default=""),
        sa.Column("checksum_sha256", sa.String(length=64), nullable=False, server_default=""),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("mime_type", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("ext", sa.String(length=20), nullable=False, server_default=""),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_evidence_case_id", "evidence", ["case_id"])
    op.create_index("ix_evidence_tool", "evidence", ["tool"])
    op.create_index("ix_evidence_sid", "evidence", ["sid"])
    op.create_index("ix_evidence_checksum_sha256", "evidence", ["checksum_sha256"])
    op.create_index("ix_evidence_created_at", "evidence", ["created_at"])

    op.create_table(
        "parsed_results",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("case_id", sa.String(length=80), sa.ForeignKey("cases.id", ondelete="CASCADE"), nullable=False),
        sa.Column("evidence_id", sa.String(length=64), sa.ForeignKey("evidence.id", ondelete="SET NULL"), nullable=True),
        sa.Column("tool", sa.String(length=80), nullable=False),
        sa.Column("parser_version", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("verdict", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("severity", sa.String(length=20), nullable=False, server_default="INFO"),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0"),
        sa.Column("top_anomaly", sa.Text(), nullable=False, server_default=""),
        sa.Column("top_suspect", sa.Text(), nullable=False, server_default=""),
        sa.Column("summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("result_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_parsed_results_case_id", "parsed_results", ["case_id"])
    op.create_index("ix_parsed_results_evidence_id", "parsed_results", ["evidence_id"])
    op.create_index("ix_parsed_results_tool", "parsed_results", ["tool"])
    op.create_index("ix_parsed_results_severity", "parsed_results", ["severity"])
    op.create_index("ix_parsed_results_created_at", "parsed_results", ["created_at"])

    op.create_table(
        "reports",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("case_id", sa.String(length=80), sa.ForeignKey("cases.id", ondelete="CASCADE"), nullable=False),
        sa.Column("report_type", sa.String(length=80), nullable=False, server_default="pdf"),
        sa.Column("file_path", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_reports_case_id", "reports", ["case_id"])
    op.create_index("ix_reports_created_at", "reports", ["created_at"])

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("case_id", sa.String(length=80), sa.ForeignKey("cases.id", ondelete="SET NULL"), nullable=True),
        sa.Column("actor", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("action", sa.String(length=120), nullable=False),
        sa.Column("target_type", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("target_id", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("detail_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_audit_logs_case_id", "audit_logs", ["case_id"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])

    op.create_table(
        "case_analytics_cache",
        sa.Column("case_id", sa.String(length=80), sa.ForeignKey("cases.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("analytics_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_case_analytics_cache_updated_at", "case_analytics_cache", ["updated_at"])


def downgrade() -> None:
    op.drop_index("ix_case_analytics_cache_updated_at", table_name="case_analytics_cache")
    op.drop_table("case_analytics_cache")

    op.drop_index("ix_audit_logs_created_at", table_name="audit_logs")
    op.drop_index("ix_audit_logs_action", table_name="audit_logs")
    op.drop_index("ix_audit_logs_case_id", table_name="audit_logs")
    op.drop_table("audit_logs")

    op.drop_index("ix_reports_created_at", table_name="reports")
    op.drop_index("ix_reports_case_id", table_name="reports")
    op.drop_table("reports")

    op.drop_index("ix_parsed_results_created_at", table_name="parsed_results")
    op.drop_index("ix_parsed_results_severity", table_name="parsed_results")
    op.drop_index("ix_parsed_results_tool", table_name="parsed_results")
    op.drop_index("ix_parsed_results_evidence_id", table_name="parsed_results")
    op.drop_index("ix_parsed_results_case_id", table_name="parsed_results")
    op.drop_table("parsed_results")

    op.drop_index("ix_evidence_created_at", table_name="evidence")
    op.drop_index("ix_evidence_checksum_sha256", table_name="evidence")
    op.drop_index("ix_evidence_sid", table_name="evidence")
    op.drop_index("ix_evidence_tool", table_name="evidence")
    op.drop_index("ix_evidence_case_id", table_name="evidence")
    op.drop_table("evidence")

    op.drop_index("ix_cases_updated_at", table_name="cases")
    op.drop_index("ix_cases_created_at", table_name="cases")
    op.drop_index("ix_cases_status", table_name="cases")
    op.drop_index("ix_cases_severity", table_name="cases")
    op.drop_index("ix_cases_sid", table_name="cases")
    op.drop_index("ix_cases_case_no", table_name="cases")
    op.drop_table("cases")
