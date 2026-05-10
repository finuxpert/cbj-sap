from __future__ import annotations

from typing import Type

from pydantic import BaseModel

from .models import CaseCreate, CaseUpdate, EvidenceUpdate, ParsedResultCreate


MODEL_CONTRACTS: dict[str, Type[BaseModel]] = {
    "EvidenceUpdate": EvidenceUpdate,
    "CaseCreate": CaseCreate,
    "CaseUpdate": CaseUpdate,
    "ParsedResultCreate": ParsedResultCreate,
}


REQUIRED_MODEL_FIELDS: dict[str, set[str]] = {
    "EvidenceUpdate": {"title", "sid", "tool", "note", "tags"},
    "CaseCreate": {
        "title",
        "sid",
        "environment",
        "severity",
        "status",
        "summary",
        "top_anomaly",
        "top_suspect",
        "created_by",
    },
    "CaseUpdate": {
        "title",
        "sid",
        "environment",
        "severity",
        "status",
        "summary",
        "top_anomaly",
        "top_suspect",
    },
    "ParsedResultCreate": {
        "tool",
        "verdict",
        "severity",
        "confidence",
        "top_anomaly",
        "top_suspect",
        "summary",
        "result_json",
    },
}


def model_field_names(model: Type[BaseModel]) -> set[str]:
    return set(getattr(model, "model_fields", {}) or getattr(model, "__fields__", {}))


def validate_model_contracts() -> dict[str, list[str]]:
    missing: dict[str, list[str]] = {}
    for name, model in MODEL_CONTRACTS.items():
        required = REQUIRED_MODEL_FIELDS[name]
        actual = model_field_names(model)
        diff = sorted(required - actual)
        if diff:
            missing[name] = diff
    return missing
