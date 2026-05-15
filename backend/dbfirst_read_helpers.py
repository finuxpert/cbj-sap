from __future__ import annotations

import os
import uuid
from datetime import date, datetime


def _cbj_dbfirst_runtime_enabled():
    # Be flexible because existing runtime/health may derive DB mode from app settings,
    # while systemd environment can use DB_MODE, DATABASE_MODE, DB_ENABLED, or only DATABASE_URL.
    mode = str(os.getenv("DB_MODE") or os.getenv("DATABASE_MODE") or "hybrid").strip().lower()
    enabled = str(os.getenv("DB_ENABLED") or os.getenv("DATABASE_ENABLED") or "true").strip().lower()
    db_url = str(os.getenv("DATABASE_URL", "")).strip()

    if enabled in ("0", "false", "no", "off"):
        return False

    if db_url and mode in ("hybrid", "postgres", "postgresql", "db", "database"):
        return True

    # Last safe fallback: DATABASE_URL exists, so DB runtime is configured.
    # Existing file-backed fallback remains available if DB read fails.
    return bool(db_url)


def _cbj_dbfirst_psycopg_url():
    url = str(os.getenv("DATABASE_URL", "")).strip()

    # Runtime DATABASE_URL uses SQLAlchemy driver style:
    # postgresql+psycopg://...
    #
    # Do not hand-split the URL because credentials may contain special chars.
    # Use SQLAlchemy's URL parser, then render a psycopg-compatible URL.
    try:
        from sqlalchemy.engine import make_url
        parsed = make_url(url)
        if parsed.drivername.startswith("postgresql"):
            parsed = parsed.set(drivername="postgresql")
        elif parsed.drivername.startswith("postgres"):
            parsed = parsed.set(drivername="postgres")
        return parsed.render_as_string(hide_password=False)
    except Exception:
        # Safe fallback for simple URLs only.
        if url.startswith("postgresql+psycopg://"):
            return "postgresql://" + url.split("postgresql+psycopg://", 1)[1]
        if url.startswith("postgres+psycopg://"):
            return "postgres://" + url.split("postgres+psycopg://", 1)[1]
        return url


def _cbj_json_safe(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, bytes):
        try:
            return value.decode("utf-8", "replace")
        except Exception:
            return str(value)
    if isinstance(value, dict):
        return {str(k): _cbj_json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_cbj_json_safe(v) for v in value]
    return value


def _cbj_pick_existing_column(columns, candidates):
    for name in candidates:
        if name in columns:
            return name
    return None


def _cbj_apply_normalized_rca_aliases(item: dict) -> dict:
    """Promote normalized RCA data stored inside result_json into top-level read fields.

    This keeps the DB schema stable while making Grafana/API/UI reads immediately useful
    for SID, environment, host, taxonomy, and RCA model filtering.
    """
    result_json = item.get("result_json") if isinstance(item.get("result_json"), dict) else {}
    normalized = result_json.get("normalized_rca") if isinstance(result_json.get("normalized_rca"), dict) else {}
    if not normalized:
        return item

    for key in (
        "sid",
        "environment",
        "client",
        "hosts",
        "affected_hosts",
        "instances",
        "workprocesses",
        "jobs",
        "programs",
        "transactions",
        "users",
        "error_signatures",
        "log_families",
        "correlation_keys",
        "evidence_ids",
        "rca_model_version",
    ):
        value = normalized.get(key)
        if value not in (None, "", [], {}) and item.get(key) in (None, "", [], {}):
            item[key] = value

    if result_json.get("original_top_suspect") and not item.get("original_top_suspect"):
        item["original_top_suspect"] = result_json.get("original_top_suspect")
    if result_json.get("rca_model_version") and not item.get("rca_model_version"):
        item["rca_model_version"] = result_json.get("rca_model_version")
    return item


def _cbj_enrich_case_from_related(case_obj: dict, parsed_rows: list[dict], evidence_rows: list[dict]) -> dict:
    """Fill case-level SID/env/host hints from related rows when case table is sparse."""
    if not parsed_rows and not evidence_rows:
        return case_obj

    for row in parsed_rows:
        _cbj_apply_normalized_rca_aliases(row)

    for field in ("sid", "environment"):
        if case_obj.get(field):
            continue
        for row in [*parsed_rows, *evidence_rows]:
            value = row.get(field)
            if value not in (None, "", [], {}):
                case_obj[field] = value
                break

    if not case_obj.get("hosts"):
        hosts = []
        for row in parsed_rows:
            for key in ("hosts", "affected_hosts"):
                value = row.get(key)
                if isinstance(value, list):
                    hosts.extend(value)
                elif value:
                    hosts.append(value)
        case_obj["hosts"] = sorted({str(host).lower() for host in hosts if str(host).strip()})[:20]

    if case_obj.get("case_stage") in (None, "", "INTAKE"):
        if parsed_rows:
            case_obj["case_stage"] = "CLASSIFIED"
        elif evidence_rows:
            case_obj["case_stage"] = "WAITING_EVIDENCE"

    return case_obj


def _cbj_dbfirst_fetch_cases(limit=300):
    import psycopg
    from psycopg.rows import dict_row

    conn_url = _cbj_dbfirst_psycopg_url()
    with psycopg.connect(conn_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'cases'
                ORDER BY ordinal_position
            """)
            columns = [r["column_name"] for r in cur.fetchall()]

            if not columns:
                return []

            order_col = _cbj_pick_existing_column(
                columns,
                ["updated_at", "created_at", "timestamp", "case_date", "id"]
            )

            sql = "SELECT * FROM cases"
            if order_col:
                sql += f' ORDER BY "{order_col}" DESC NULLS LAST'
            sql += " LIMIT %s"

            cur.execute(sql, (limit,))
            rows = cur.fetchall()

    result = []
    for row in rows:
        item = _cbj_json_safe(dict(row))
        item.setdefault("read_source", "postgres")
        result.append(item)
    return result


def _cbj_dbfirst_fetch_case_detail(case_key):
    import psycopg
    from psycopg.rows import dict_row

    conn_url = _cbj_dbfirst_psycopg_url()
    with psycopg.connect(conn_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'cases'
                ORDER BY ordinal_position
            """)
            case_columns = [r["column_name"] for r in cur.fetchall()]
            if not case_columns:
                return None

            id_col = _cbj_pick_existing_column(
                case_columns,
                ["id", "case_id", "case_key", "slug", "name", "title"]
            )
            if not id_col:
                return None

            cur.execute(f'SELECT * FROM cases WHERE "{id_col}"::text = %s LIMIT 1', (str(case_key),))
            case_row = cur.fetchone()
            if not case_row:
                return None

            case_obj = _cbj_json_safe(dict(case_row))
            case_obj.setdefault("read_source", "postgres")

            # Attach related evidence when possible.
            evidence_rows = []
            try:
                cur.execute("""
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'evidence'
                    ORDER BY ordinal_position
                """)
                evidence_columns = [r["column_name"] for r in cur.fetchall()]
                evidence_case_col = _cbj_pick_existing_column(
                    evidence_columns,
                    ["case_id", "case_key", "case_ref", "case_uuid"]
                )
                if evidence_case_col:
                    cur.execute(
                        f'SELECT * FROM evidence WHERE "{evidence_case_col}"::text = %s ORDER BY 1 DESC LIMIT 500',
                        (str(case_key),),
                    )
                    evidence_rows = [_cbj_json_safe(dict(r)) for r in cur.fetchall()]
            except Exception as exc:
                case_obj["evidence_read_warning"] = str(exc)

            # Attach parsed results when possible.
            parsed_rows = []
            try:
                cur.execute("""
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'parsed_results'
                    ORDER BY ordinal_position
                """)
                parsed_columns = [r["column_name"] for r in cur.fetchall()]
                parsed_case_col = _cbj_pick_existing_column(
                    parsed_columns,
                    ["case_id", "case_key", "case_ref", "case_uuid"]
                )
                if parsed_case_col:
                    cur.execute(
                        f'SELECT * FROM parsed_results WHERE "{parsed_case_col}"::text = %s ORDER BY 1 DESC LIMIT 200',
                        (str(case_key),),
                    )
                    parsed_rows = [_cbj_apply_normalized_rca_aliases(_cbj_json_safe(dict(r))) for r in cur.fetchall()]
            except Exception as exc:
                case_obj["parsed_results_read_warning"] = str(exc)

    # Keep compatible but additive.
    case_obj.setdefault("evidence", evidence_rows)
    case_obj.setdefault("parsed_results", parsed_rows)
    return _cbj_enrich_case_from_related(case_obj, parsed_rows, evidence_rows)


def _cbj_dbfirst_fetch_parsed_results_history(case_id="", tool="", limit=100):
    import psycopg
    from psycopg.rows import dict_row

    conn_url = _cbj_dbfirst_psycopg_url()
    with psycopg.connect(conn_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'parsed_results'
                ORDER BY ordinal_position
            """)
            columns = [r["column_name"] for r in cur.fetchall()]

            if not columns:
                return []

            where = []
            params = []

            case_col = _cbj_pick_existing_column(columns, ["case_id", "case_key", "case_ref", "case_uuid"])
            tool_col = _cbj_pick_existing_column(columns, ["tool", "parser", "tool_name"])
            order_col = _cbj_pick_existing_column(columns, ["created_at", "updated_at", "timestamp", "id"])

            if case_id and case_col:
                where.append(f'"{case_col}"::text = %s')
                params.append(str(case_id))

            if tool and tool_col:
                where.append(f'LOWER("{tool_col}"::text) = LOWER(%s)')
                params.append(str(tool))

            sql = "SELECT * FROM parsed_results"
            if where:
                sql += " WHERE " + " AND ".join(where)
            if order_col:
                sql += f' ORDER BY "{order_col}" DESC NULLS LAST'
            sql += " LIMIT %s"
            params.append(limit)

            cur.execute(sql, tuple(params))
            rows = cur.fetchall()

    result = []
    for row in rows:
        item = _cbj_apply_normalized_rca_aliases(_cbj_json_safe(dict(row)))
        item.setdefault("read_source", "postgres")
        result.append(item)
    return result


def _cbj_dbfirst_fetch_evidence_history(limit=300):
    import psycopg
    from psycopg.rows import dict_row

    conn_url = _cbj_dbfirst_psycopg_url()
    with psycopg.connect(conn_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'evidence'
                ORDER BY ordinal_position
            """)
            columns = [r["column_name"] for r in cur.fetchall()]

            if not columns:
                return []

            order_col = _cbj_pick_existing_column(
                columns,
                ["updated_at", "created_at", "timestamp", "id"]
            )

            sql = "SELECT * FROM evidence"
            if order_col:
                sql += f' ORDER BY "{order_col}" DESC NULLS LAST'
            sql += " LIMIT %s"

            cur.execute(sql, (limit,))
            rows = cur.fetchall()

    result = []
    for row in rows:
        item = _cbj_json_safe(dict(row))
        item.setdefault("read_source", "postgres")
        result.append(item)
    return result
