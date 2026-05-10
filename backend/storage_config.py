from __future__ import annotations

import os
from pathlib import Path


APP_NAME = "SAP Intelligent RCA Evidence API"
STORAGE_ROOT = Path(os.getenv("SAP_EVIDENCE_ROOT", "/var/www/svr01-dev/sap-data"))
EVIDENCE_DIR = STORAGE_ROOT / "evidence"
META_DIR = STORAGE_ROOT / "metadata"
REPORT_DIR = STORAGE_ROOT / "reports"
CASE_DIR = STORAGE_ROOT / "cases"
MAX_UPLOAD_MB = int(os.getenv("SAP_EVIDENCE_MAX_UPLOAD_MB", "500"))

ALLOWED_EXT = {
    ".zip",
    ".log",
    ".txt",
    ".csv",
    ".xlsx",
    ".xls",
    ".pdf",
    ".json",
}


def storage_snapshot() -> dict:
    return {
        "app_name": APP_NAME,
        "storage_root": str(STORAGE_ROOT),
        "evidence_dir": str(EVIDENCE_DIR),
        "meta_dir": str(META_DIR),
        "report_dir": str(REPORT_DIR),
        "case_dir": str(CASE_DIR),
        "max_upload_mb": MAX_UPLOAD_MB,
        "allowed_ext": sorted(ALLOWED_EXT),
    }
