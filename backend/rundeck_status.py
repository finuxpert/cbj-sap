"""Shared SPHERE status semantics for SAP Application Server monitoring.

Host resource health and SAP workload state are intentionally separate domains.
A Critical Work Process signal must not make CPU/RAM/IO health appear unhealthy.
"""
from __future__ import annotations

from backend.rundeck_monitoring import (
    CPU_CRITICAL,
    CPU_WARNING,
    IOWAIT_CRITICAL,
    IOWAIT_WARNING,
    RAM_CRITICAL,
    RAM_WARNING,
    WP_CRITICAL,
)


def _number(value):
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def host_resource_state(metric: dict) -> str:
    cpu = _number(metric.get("cpu_pct"))
    ram = _number(metric.get("ram_pct"))
    io_wait = _number(metric.get("io_wait_pct"))
    if (
        (cpu is not None and cpu >= CPU_CRITICAL)
        or (ram is not None and ram >= RAM_CRITICAL)
        or (io_wait is not None and io_wait >= IOWAIT_CRITICAL)
    ):
        return "CRITICAL"
    if (
        (cpu is not None and cpu >= CPU_WARNING)
        or (ram is not None and ram >= RAM_WARNING)
        or (io_wait is not None and io_wait >= IOWAIT_WARNING)
    ):
        return "WARNING"
    return "NORMAL"


def sap_workload_state(metric: dict) -> str:
    wp = _number(metric.get("wp_critical")) or 0.0
    if wp >= WP_CRITICAL:
        return "CRITICAL"
    if wp > 0:
        return "ATTENTION"
    return "NORMAL"


def operational_state(metric: dict) -> str:
    resource = host_resource_state(metric)
    workload = sap_workload_state(metric)
    if resource == "CRITICAL" or workload == "CRITICAL":
        return "CRITICAL"
    if resource == "WARNING":
        return "WARNING"
    if workload == "ATTENTION":
        return "ATTENTION"
    return "NORMAL"


def enrich_host_state(metric: dict) -> dict:
    """Return one API row with explicit semantic status fields.

    ``health`` remains for compatibility but now means host resource health only.
    New consumers should use the explicit fields.
    """
    row = dict(metric)
    resource = host_resource_state(row)
    workload = sap_workload_state(row)
    row["health"] = resource
    row["resource_health"] = resource
    row["sap_workload_state"] = workload
    row["operational_state"] = operational_state(row)
    return row
