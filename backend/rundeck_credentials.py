"""Resolve Rundeck credentials without exposing secret material.

systemd credentials are preferred. Legacy file paths remain a compatibility fallback so
existing /dev deployments can migrate without embedding tokens in environment variables.
"""
from __future__ import annotations

import os
from pathlib import Path


def credential_path(name: str, legacy_env: str) -> Path:
    directory = os.getenv("CREDENTIALS_DIRECTORY", "").strip()
    if directory:
        candidate = Path(directory) / name
        if candidate.is_file():
            return candidate

    legacy = os.getenv(legacy_env, "").strip()
    if legacy:
        candidate = Path(legacy)
        if candidate.is_file():
            return candidate

    raise RuntimeError(f"Credential {name} is not configured")


def read_credential(name: str, legacy_env: str) -> str:
    value = credential_path(name, legacy_env).read_text().strip()
    if not value:
        raise RuntimeError(f"Credential {name} is empty")
    return value


def credential_mode(name: str, legacy_env: str) -> str:
    """Return only the credential source class; never return a path or token."""
    directory = os.getenv("CREDENTIALS_DIRECTORY", "").strip()
    if directory and (Path(directory) / name).is_file():
        return "systemd"
    legacy = os.getenv(legacy_env, "").strip()
    if legacy and Path(legacy).is_file():
        return "file"
    return "missing"
