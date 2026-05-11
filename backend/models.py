from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class EvidenceUpdate(BaseModel):
    title: Optional[str] = None
    sid: Optional[str] = None
    tool: Optional[str] = None
    note: Optional[str] = None
    tags: Optional[list[str]] = None


class CaseCreate(BaseModel):
    title: str
    sid: Optional[str] = ""
    environment: Optional[str] = ""
    severity: Optional[str] = "INFO"
    status: Optional[str] = "OPEN"
    summary: Optional[str] = ""
    top_anomaly: Optional[str] = ""
    top_suspect: Optional[str] = ""
    created_by: Optional[str] = ""


class CaseUpdate(BaseModel):
    title: Optional[str] = None
    sid: Optional[str] = None
    environment: Optional[str] = None
    severity: Optional[str] = None
    status: Optional[str] = None
    summary: Optional[str] = None
    top_anomaly: Optional[str] = None
    top_suspect: Optional[str] = None


class ParsedResultCreate(BaseModel):
    tool: str
    verdict: Optional[str] = ""
    severity: Optional[str] = "INFO"
    confidence: Optional[float] = 0
    top_anomaly: Optional[str] = ""
    top_suspect: Optional[str] = ""
    summary: Optional[str] = ""

    # Normalized RCA data model fields.
    # These are additive and optional so old parser payloads remain valid.
    incident_start: Optional[str] = ""
    incident_end: Optional[str] = ""
    sid: Optional[str] = ""
    environment: Optional[str] = ""
    client: Optional[str] = ""
    hosts: Optional[list[str]] = None
    affected_hosts: Optional[list[str]] = None
    instances: Optional[list[str]] = None
    workprocesses: Optional[list[str]] = None
    jobs: Optional[list[str]] = None
    programs: Optional[list[str]] = None
    transactions: Optional[list[str]] = None
    users: Optional[list[str]] = None
    error_signatures: Optional[list[str]] = None
    log_families: Optional[list[str]] = None
    metrics: Optional[dict] = None
    correlation_keys: Optional[list[str]] = None
    evidence_ids: Optional[list[str]] = None
    rca_model_version: Optional[str] = "rca-data-model-v1"

    result_json: Optional[dict] = None
