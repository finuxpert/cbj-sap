"""Rundeck monitoring history and optional TimescaleDB support.

Revision ID: 20260910_0002
Revises: 20260509_0001
Create Date: 2026-09-10
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260910_0002"
down_revision = "20260509_0001"
branch_labels = None
depends_on = None


def _try_enable_timescale() -> None:
    """Best effort only: PostgreSQL remains fully supported without TimescaleDB."""
    bind = op.get_bind()
    bind.execute(sa.text("SAVEPOINT sphere_timescale"))
    try:
        bind.execute(sa.text("CREATE EXTENSION IF NOT EXISTS timescaledb"))
        enabled = bind.execute(
            sa.text("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname='timescaledb')")
        ).scalar()
        if enabled:
            bind.execute(sa.text(
                "SELECT create_hypertable('rundeck_host_metrics', 'collected_at', "
                "if_not_exists => TRUE, migrate_data => TRUE)"
            ))
            bind.execute(sa.text(
                "SELECT create_hypertable('rundeck_top_consumers', 'collected_at', "
                "if_not_exists => TRUE, migrate_data => TRUE)"
            ))
        bind.execute(sa.text("RELEASE SAVEPOINT sphere_timescale"))
    except Exception:
        bind.execute(sa.text("ROLLBACK TO SAVEPOINT sphere_timescale"))
        bind.execute(sa.text("RELEASE SAVEPOINT sphere_timescale"))


def upgrade() -> None:
    op.create_table(
        "rundeck_collections",
        sa.Column("collection_id", sa.String(length=96), primary_key=True),
        sa.Column("execution_id", sa.String(length=40), nullable=False, unique=True),
        sa.Column("source", sa.String(length=32), nullable=False, server_default="rundeck"),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expected_host_count", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("received_host_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("expected_hosts", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("received_hosts", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("checksum_sha256", sa.String(length=64), nullable=True),
        sa.Column("raw_path", sa.Text(), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_rundeck_collections_finished_at", "rundeck_collections", ["finished_at"])
    op.create_index("ix_rundeck_collections_status_finished", "rundeck_collections", ["status", "finished_at"])

    op.create_table(
        "rundeck_host_metrics",
        sa.Column("collection_id", sa.String(length=96), sa.ForeignKey("rundeck_collections.collection_id", ondelete="CASCADE"), nullable=False),
        sa.Column("collected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("host", sa.String(length=120), nullable=False),
        sa.Column("cpu_pct", sa.Float(), nullable=True),
        sa.Column("ram_pct", sa.Float(), nullable=True),
        sa.Column("load_1", sa.Float(), nullable=True),
        sa.Column("io_wait_pct", sa.Float(), nullable=True),
        sa.Column("swap_pct", sa.Float(), nullable=True),
        sa.Column("wp_critical", sa.Integer(), nullable=True),
        sa.Column("health", sa.String(length=20), nullable=False, server_default="NORMAL"),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.PrimaryKeyConstraint("collection_id", "host", "collected_at", name="pk_rundeck_host_metrics"),
    )
    op.create_index("ix_rundeck_host_metrics_host_time", "rundeck_host_metrics", ["host", "collected_at"])
    op.create_index("ix_rundeck_host_metrics_time", "rundeck_host_metrics", ["collected_at"])

    op.create_table(
        "rundeck_top_consumers",
        sa.Column("collection_id", sa.String(length=96), sa.ForeignKey("rundeck_collections.collection_id", ondelete="CASCADE"), nullable=False),
        sa.Column("collected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("host", sa.String(length=120), nullable=False),
        sa.Column("consumer_type", sa.String(length=32), nullable=False),
        sa.Column("consumer_key", sa.String(length=255), nullable=False),
        sa.Column("rank", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("cpu_pct", sa.Float(), nullable=True),
        sa.Column("ram_pct", sa.Float(), nullable=True),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.PrimaryKeyConstraint(
            "collection_id", "host", "collected_at", "consumer_type", "consumer_key",
            name="pk_rundeck_top_consumers",
        ),
    )
    op.create_index("ix_rundeck_top_consumers_host_time", "rundeck_top_consumers", ["host", "collected_at"])
    op.create_index("ix_rundeck_top_consumers_key_time", "rundeck_top_consumers", ["consumer_type", "consumer_key", "collected_at"])

    op.create_table(
        "rundeck_alerts",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("collection_id", sa.String(length=96), sa.ForeignKey("rundeck_collections.collection_id", ondelete="CASCADE"), nullable=True),
        sa.Column("collected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("host", sa.String(length=120), nullable=True),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("severity", sa.String(length=20), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_rundeck_alerts_time", "rundeck_alerts", ["collected_at"])
    op.create_index("ix_rundeck_alerts_open", "rundeck_alerts", ["resolved_at", "severity"])

    op.create_table(
        "rundeck_manual_runs",
        sa.Column("execution_id", sa.String(length=40), primary_key=True),
        sa.Column("job_id", sa.String(length=64), nullable=False),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("requested_by", sa.String(length=120), nullable=False, server_default="sphere"),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    op.create_index("ix_rundeck_manual_runs_requested", "rundeck_manual_runs", ["requested_at"])

    _try_enable_timescale()


def downgrade() -> None:
    op.drop_table("rundeck_manual_runs")
    op.drop_table("rundeck_alerts")
    op.drop_table("rundeck_top_consumers")
    op.drop_table("rundeck_host_metrics")
    op.drop_table("rundeck_collections")
