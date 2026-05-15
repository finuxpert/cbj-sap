-- SAP Intelligent RCA Workspace
-- Grafana-ready PostgreSQL views for full-DB Case History.
--
-- Intent:
-- - PostgreSQL is the Case History source of truth.
-- - Grafana should query PostgreSQL directly, not legacy JSON files.
-- - These views are idempotent and safe to re-apply during DEV validation.
--
-- Expected base tables are defined by backend/db/models.py:
-- - cases
-- - parsed_results
-- - evidence

CREATE OR REPLACE VIEW grafana_rca_cases AS
SELECT
  c.created_at AS "time",
  c.id AS case_id,
  c.case_no,
  c.title,
  c.sid,
  c.environment,
  c.severity,
  c.status,
  c.case_stage,
  c.summary,
  c.top_anomaly,
  c.top_suspect,
  c.created_by,
  c.created_at,
  c.updated_at,
  COALESCE(pr.parsed_result_count, 0) AS parsed_result_count,
  COALESCE(ev.evidence_count, 0) AS evidence_count,
  COALESCE(ev.total_evidence_bytes, 0) AS total_evidence_bytes
FROM cases c
LEFT JOIN (
  SELECT case_id, COUNT(*)::integer AS parsed_result_count
  FROM parsed_results
  GROUP BY case_id
) pr ON pr.case_id = c.id
LEFT JOIN (
  SELECT
    case_id,
    COUNT(*)::integer AS evidence_count,
    COALESCE(SUM(size_bytes), 0)::bigint AS total_evidence_bytes
  FROM evidence
  WHERE case_id IS NOT NULL
  GROUP BY case_id
) ev ON ev.case_id = c.id;

CREATE OR REPLACE VIEW grafana_rca_parsed_results AS
SELECT
  pr.created_at AS "time",
  pr.id AS parsed_result_id,
  pr.case_id,
  c.case_no,
  c.title AS case_title,
  c.sid,
  c.environment,
  c.status AS case_status,
  c.case_stage,
  pr.evidence_id,
  pr.tool,
  pr.parser_version,
  pr.verdict,
  pr.severity,
  pr.confidence,
  pr.top_anomaly,
  pr.top_suspect,
  pr.summary,
  pr.result_json,
  pr.created_at
FROM parsed_results pr
LEFT JOIN cases c ON c.id = pr.case_id;

CREATE OR REPLACE VIEW grafana_rca_evidence AS
SELECT
  e.created_at AS "time",
  e.id AS evidence_id,
  e.case_id,
  c.case_no,
  c.title AS case_title,
  c.sid AS case_sid,
  c.environment AS case_environment,
  c.status AS case_status,
  c.case_stage,
  e.tool,
  e.sid AS evidence_sid,
  e.title,
  e.original_filename,
  e.stored_filename,
  e.stored_path,
  e.checksum_sha256,
  e.size_bytes,
  e.mime_type,
  e.ext,
  e.note,
  e.tags,
  e.created_at,
  e.updated_at
FROM evidence e
LEFT JOIN cases c ON c.id = e.case_id;

CREATE OR REPLACE VIEW grafana_rca_case_summary AS
SELECT
  c.updated_at AS "time",
  c.id AS case_id,
  c.case_no,
  c.title,
  c.sid,
  c.environment,
  c.severity,
  c.status,
  c.case_stage,
  c.top_anomaly,
  c.top_suspect,
  COALESCE(pr.parsed_result_count, 0) AS parsed_result_count,
  pr.latest_parsed_at,
  pr.latest_tool,
  pr.latest_verdict,
  pr.latest_confidence,
  COALESCE(ev.evidence_count, 0) AS evidence_count,
  ev.latest_evidence_at,
  GREATEST(
    c.updated_at,
    COALESCE(pr.latest_parsed_at, c.updated_at),
    COALESCE(ev.latest_evidence_at, c.updated_at)
  ) AS last_activity_at
FROM cases c
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)::integer AS parsed_result_count,
    MAX(created_at) AS latest_parsed_at,
    (ARRAY_AGG(tool ORDER BY created_at DESC))[1] AS latest_tool,
    (ARRAY_AGG(verdict ORDER BY created_at DESC))[1] AS latest_verdict,
    (ARRAY_AGG(confidence ORDER BY created_at DESC))[1] AS latest_confidence
  FROM parsed_results
  WHERE case_id = c.id
) pr ON TRUE
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)::integer AS evidence_count,
    MAX(created_at) AS latest_evidence_at
  FROM evidence
  WHERE case_id = c.id
) ev ON TRUE;

-- Suggested Grafana time columns:
-- - grafana_rca_cases."time"
-- - grafana_rca_parsed_results."time"
-- - grafana_rca_evidence."time"
-- - grafana_rca_case_summary.last_activity_at
