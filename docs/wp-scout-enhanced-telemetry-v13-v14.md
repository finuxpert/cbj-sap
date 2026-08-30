# WP-SCOUT Enhanced RCA Telemetry — v1.13 / v1.14

This extension adds optional Linux evidence to the existing WP-SCOUT/Daily Check log format. Old logs remain supported.

## Why

Plain RSS and a `D` process state are not enough to distinguish a memory consumer from a blocked victim. The enhanced block records:

- host CPU iowait
- Linux PSI (`cpu`, `memory`, `io`, `some/full avg10`)
- per-process PSS, private and shared resident memory
- WCHAN
- cumulative `/proc/<pid>/io` counters
- cumulative major faults

The browser RCA engine uses these only when they are present. Missing or permission-denied fields remain unavailable; they are never converted to zero.

## Collector

`ops/wp-scout-rca-telemetry-v13.sh` is read-only and best effort.

```bash
chmod +x ops/wp-scout-rca-telemetry-v13.sh
./ops/wp-scout-rca-telemetry-v13.sh >> wp-scout.log
```

Optional explicit PID list:

```bash
RCA_PID_LIST="1234 5678 9012" ./ops/wp-scout-rca-telemetry-v13.sh >> wp-scout.log
```

Without `RCA_PID_LIST`, the script discovers common SAP application processes using `ps`.

Environment variables:

- `RCA_SAMPLE_SECONDS` — `/proc/stat` sampling interval for iowait, default `1`.
- `RCA_MAX_PIDS` — maximum processes sampled, default `80`.
- `RCA_PID_LIST` — optional space/comma separated PID list.

`/proc/<pid>/smaps_rollup` can be restricted by Linux ptrace/Yama policy or process ownership. PSS/private/shared output becomes `NA` when inaccessible. The collector does not use `sudo` and does not alter permissions.

## Log format

```text
## RCA-EXT @ AOPH1PAPPDC TS=2026-01-15 11:25:00 VERSION=1.13
EXT_HOST iowait_pct=31.2 psi_cpu_some10=5.4 psi_cpu_full10=0 psi_mem_some10=22 psi_mem_full10=8 psi_io_some10=42 psi_io_full10=18 sample_seconds=1
EXT_PROC pid=1234 state=D wchan=nfs_file_read pss_kb=3984588 private_kb=812000 shared_kb=3172588 read_bytes=901234567 write_bytes=120000 majflt=142
```

The parser correlates the enhanced host/process block with the nearest same-host WP-SCOUT snapshot, bounded to five minutes.

## v1.14 deterministic interpretation

The engine can refine incident patterns using enhanced evidence:

- `NFS_IO_CONTENTION`
- `BLOCK_IO_CONTENTION`
- `IO_STALL_CONTENTION`
- `MEMORY_RECLAIM_STALL`
- `MEMORY_IO_CONTENTION`
- `MEMORY_BLOCKING_CONTENTION`
- `CPU_SATURATION`
- legacy fallback patterns when enhanced telemetry is absent

Workload roles can be refined to:

- `MEMORY_CONSUMER`
- `IO_CONSUMER`
- `BLOCKED_VICTIM`
- `MIXED`
- `ERROR_SIGNAL`
- legacy `RESOURCE_CONSUMER` / `BACKGROUND`

PSS is additive across processes and is preferred over summed RSS for physical-memory attribution. RSS remains contextual evidence only.

## Error taxonomy

v1.14 classifies observed SAP error codes into deterministic categories such as:

- memory allocation
- DB concurrency / deadlock
- DB constraint
- RFC/network
- timeout
- application exception
- ABAP data/serialization

An error can be `CAUSAL_CAPABLE`, `SUPPORTING`, `SYMPTOM_LIKELY`, or `UNKNOWN`. Error presence alone never proves root cause.

## Backward compatibility

A legacy log without `RCA-EXT` continues through the existing deterministic pipeline. The UI reports `Telemetry mode: LEGACY`; enhanced fields display `—`.

No enhanced signal is synthesized from missing data.
