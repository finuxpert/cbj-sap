from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Iterator

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
DB_MODE = os.getenv("DB_MODE", "file").strip().lower() or "file"

_ENGINE = None
_SESSION_LOCAL = None
_SQLALCHEMY_ERROR: str | None = None

try:
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker
except Exception as exc:  # pragma: no cover - optional dependency guard
    create_engine = None  # type: ignore[assignment]
    text = None  # type: ignore[assignment]
    sessionmaker = None  # type: ignore[assignment]
    _SQLALCHEMY_ERROR = str(exc)


def db_configured() -> bool:
    return bool(DATABASE_URL)


def db_enabled() -> bool:
    return DB_MODE in {"db", "hybrid"} and db_configured() and create_engine is not None


def get_engine():
    global _ENGINE, _SESSION_LOCAL
    if not db_enabled():
        return None
    if _ENGINE is None:
        _ENGINE = create_engine(
            DATABASE_URL,
            pool_pre_ping=True,
            pool_size=int(os.getenv("DB_POOL_SIZE", "5")),
            max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "10")),
            pool_timeout=int(os.getenv("DB_POOL_TIMEOUT", "30")),
            future=True,
        )
        _SESSION_LOCAL = sessionmaker(bind=_ENGINE, autoflush=False, autocommit=False, future=True)
    return _ENGINE


@contextmanager
def session_scope() -> Iterator:
    engine = get_engine()
    if engine is None or _SESSION_LOCAL is None:
        raise RuntimeError("Database is not enabled or not configured")
    session = _SESSION_LOCAL()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def check_database() -> dict:
    if not db_configured():
        return {
            "enabled": False,
            "configured": False,
            "mode": DB_MODE,
            "status": "not_configured",
        }
    if create_engine is None:
        return {
            "enabled": False,
            "configured": True,
            "mode": DB_MODE,
            "status": "dependency_missing",
            "error": _SQLALCHEMY_ERROR,
        }
    if not db_enabled():
        return {
            "enabled": False,
            "configured": True,
            "mode": DB_MODE,
            "status": "disabled_by_mode",
        }
    try:
        engine = get_engine()
        assert engine is not None
        with engine.connect() as conn:
            value = conn.execute(text("SELECT 1")).scalar_one()
        return {
            "enabled": True,
            "configured": True,
            "mode": DB_MODE,
            "status": "ok" if value == 1 else "unexpected_result",
        }
    except Exception as exc:
        return {
            "enabled": True,
            "configured": True,
            "mode": DB_MODE,
            "status": "error",
            "error": str(exc),
        }
