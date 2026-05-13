-- Grafana-ready PostgreSQL views for SAP Intelligent RCA Workspace.
--
-- Scope:
-- - read-only observability views
-- - no raw evidence file path exposure
-- - safe for Grafana datasource usage
-- - incremental/non-destructive
--
-- Recommended Grafana datasource:
-- PostgreSQL read-only user.

CREATE OR REPLACE VIEW grafana_sap_rca_cases AS
SELECT
    c.created_at AS time,
    c.id AS case_id,
    c.case_no,
    c.title,
    c.sid,
    c.environment,
    c.severity,
    c.status,
    COALESCE(NULLIF(c.summary, ''), 'No summary') AS summary,
    COALESCE(NULLIF(c.top_anomaly, ''), 'Unknown') AS top_anomaly,
    COALESCE(NULLIF(c.top_suspect, ''), 'Unknown') AS top_suspect,
    COALESCE(c.created_at, NOW()) AS created_at,
    COALESCE(c.updated_at, NOW()) AS updated_at,
    COUNT(DISTINCT e.id) AS evidence_count,
    COUNT(DISTINCT pr.id) AS parsed_result_count,
    MAX(COALESCE(pr.confidence, 0)) AS confidence,
    CASE
        WHEN COUNT(pr.id) = 0 THEN 'WAITING_EVIDENCE'
        WHEN MAX(COALESCE(pr.confidence, 0)) >= 0.5 THEN 'CLASSIFIED'
        ELSE 'ANALYZING'
    END AS case_stage,
    'https://sapdev.cbj-kontruksi.com/cases/' || c.id AS case_url
FROM cases c
LEFT JOIN evidence e
    ON e.case_id = c.id
LEFT JOIN parsed_results pr
    ON pr.case_id = c.id
GROUP BY
    c.id,
    c.case_no,
    c.title,
    c.sid,
    c.environment,
    c.severity,
    c.status,
    c.summary,
    c.top_anomaly,
    c.top_suspect,
    c.created_at,
    c.updated_at;


CREATE OR REPLACE VIEW grafana_sap_pending_cases AS
SELECT *
FROM grafana_sap_rca_cases
WHERE case_stage IN (
    'WAITING_EVIDENCE',
    'ANALYZING'
);


CREATE OR REPLACE VIEW grafana_sap_evidence_flow AS
SELECT
    e.created_at AS time,
    e.id AS evidence_id,
    e.case_id,
    e.sid,
    e.tool,
    e.title,
    e.original_filename,
    e.size_bytes,
    c.severity,
    c.status,
    CASE
        WHEN pr.id IS NOT NULL THEN 'CLASSIFIED'
        WHEN e.case_id IS NOT NULL THEN 'ANALYZING'
        ELSE 'WAITING_EVIDENCE'
    END AS case_stage,
    'https://sapdev.cbj-kontruksi.com/cases/' || e.case_id AS case_url
FROM evidence e
LEFT JOIN cases c
    ON c.id = e.case_id
LEFT JOIN parsed_results pr
    ON pr.evidence_id = e.id;


CREATE OR REPLACE VIEW grafana_sap_case_node_compare AS
SELECT
    pr.created_at AS time,
    c.id AS case_id,
    c.sid,
    c.environment,
    COALESCE(hosts.value::text, 'unknown') AS host,
    COALESCE(pr.tool, 'unknown') AS source_tool,
    pr.severity,
    pr.confidence AS suspect_score,
    COALESCE(pr.top_suspect, 'Unknown') AS top_suspect,
    COALESCE(pr.top_anomaly, 'Unknown') AS top_anomaly,
    COALESCE(pr.summary, '') AS summary,
    'https://sapdev.cbj-kontruksi.com/cases/' || c.id AS case_url
FROM parsed_results pr
JOIN cases c
    ON c.id = pr.case_id
LEFT JOIN LATERAL jsonb_array_elements_text(
    COALESCE(pr.result_json->'hosts', '["unknown"]'::jsonb)
) AS hosts(value)
    ON TRUE;
