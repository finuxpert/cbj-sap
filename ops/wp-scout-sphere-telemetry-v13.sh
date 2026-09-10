#!/usr/bin/env bash
# WP-SCOUT RCA enhanced Linux telemetry v1.13
# Read-only, best-effort collector. It does not modify kernel, SAP, filesystems, or process state.
# Usage:
#   ./wp-scout-rca-telemetry-v13.sh >> existing-wp-scout.log
# Optional:
#   RCA_PID_LIST="1234 5678" RCA_SAMPLE_SECONDS=1 RCA_MAX_PIDS=80 ./wp-scout-rca-telemetry-v13.sh
#
# smaps_rollup may be restricted by ptrace/Yama permissions. In that case PSS/private/shared are printed as NA.

set -u

HOST_NAME="${HOSTNAME:-$(hostname 2>/dev/null || echo UNKNOWN)}"
NOW="$(date '+%Y-%m-%d %H:%M:%S')"
SAMPLE_SECONDS="${RCA_SAMPLE_SECONDS:-1}"
MAX_PIDS="${RCA_MAX_PIDS:-80}"

safe_num() {
  local value="${1:-}"
  if [[ "$value" =~ ^-?[0-9]+([.][0-9]+)?$ ]]; then printf '%s' "$value"; else printf 'NA'; fi
}

cpu_line() {
  awk '/^cpu / {print; exit}' /proc/stat 2>/dev/null
}

cpu_total_iowait() {
  local line="$1"
  awk '{
    total=0;
    for(i=2;i<=NF;i++) total+=$i;
    wait=$6;
    print total, wait
  }' <<<"$line"
}

CPU_A="$(cpu_line)"
read -r TOTAL_A WAIT_A <<<"$(cpu_total_iowait "$CPU_A")"
sleep "$SAMPLE_SECONDS" 2>/dev/null || true
CPU_B="$(cpu_line)"
read -r TOTAL_B WAIT_B <<<"$(cpu_total_iowait "$CPU_B")"
IOWAIT_PCT="NA"
if [[ "${TOTAL_A:-}" =~ ^[0-9]+$ && "${TOTAL_B:-}" =~ ^[0-9]+$ && "${WAIT_A:-}" =~ ^[0-9]+$ && "${WAIT_B:-}" =~ ^[0-9]+$ ]]; then
  DT=$((TOTAL_B - TOTAL_A))
  DW=$((WAIT_B - WAIT_A))
  if (( DT > 0 && DW >= 0 )); then
    IOWAIT_PCT="$(awk -v dw="$DW" -v dt="$DT" 'BEGIN { printf "%.3f", (dw/dt)*100 }')"
  fi
fi

psi_avg10() {
  local file="$1" kind="$2"
  if [[ ! -r "$file" ]]; then printf 'NA'; return; fi
  awk -v kind="$kind" '$1==kind {for(i=2;i<=NF;i++) if($i ~ /^avg10=/){split($i,a,"="); print a[2]; exit}}' "$file" 2>/dev/null | awk 'NF{print; found=1} END{if(!found) print "NA"}'
}

CPU_SOME="$(psi_avg10 /proc/pressure/cpu some)"
CPU_FULL="$(psi_avg10 /proc/pressure/cpu full)"
MEM_SOME="$(psi_avg10 /proc/pressure/memory some)"
MEM_FULL="$(psi_avg10 /proc/pressure/memory full)"
IO_SOME="$(psi_avg10 /proc/pressure/io some)"
IO_FULL="$(psi_avg10 /proc/pressure/io full)"

printf '## RCA-EXT @ %s TS=%s VERSION=1.13\n' "$HOST_NAME" "$NOW"
printf 'EXT_HOST iowait_pct=%s psi_cpu_some10=%s psi_cpu_full10=%s psi_mem_some10=%s psi_mem_full10=%s psi_io_some10=%s psi_io_full10=%s sample_seconds=%s\n' \
  "$(safe_num "$IOWAIT_PCT")" "$(safe_num "$CPU_SOME")" "$(safe_num "$CPU_FULL")" \
  "$(safe_num "$MEM_SOME")" "$(safe_num "$MEM_FULL")" "$(safe_num "$IO_SOME")" "$(safe_num "$IO_FULL")" "$(safe_num "$SAMPLE_SECONDS")"

discover_pids() {
  if [[ -n "${RCA_PID_LIST:-}" ]]; then
    tr ',;' '  ' <<<"$RCA_PID_LIST" | tr -s ' ' '\n' | awk '/^[0-9]+$/'
    return
  fi
  ps -eo pid=,comm=,args= 2>/dev/null | awk '
    BEGIN{IGNORECASE=1}
    /disp\+work|dw\.sap|gwrd|icman|jstart|sapstartsrv/ {print $1}
  ' | awk '/^[0-9]+$/'
}

read_smaps() {
  local pid="$1" file="/proc/$pid/smaps_rollup"
  if [[ ! -r "$file" ]]; then printf 'NA NA NA'; return; fi
  awk '
    /^Pss:/ {pss=$2}
    /^Private_Clean:/ {priv+=$2}
    /^Private_Dirty:/ {priv+=$2}
    /^Private_Hugetlb:/ {priv+=$2}
    /^Shared_Clean:/ {shared+=$2}
    /^Shared_Dirty:/ {shared+=$2}
    /^Shared_Hugetlb:/ {shared+=$2}
    END {
      if(pss=="") pss="NA";
      if(priv=="") priv="NA";
      if(shared=="") shared="NA";
      print pss, priv, shared
    }
  ' "$file" 2>/dev/null || printf 'NA NA NA'
}

read_io_field() {
  local pid="$1" field="$2"
  local file="/proc/$pid/io"
  if [[ ! -r "$file" ]]; then printf 'NA'; return; fi
  awk -v field="$field" '$1==field":" {print $2; found=1; exit} END{if(!found) print "NA"}' "$file" 2>/dev/null
}

read_state_majflt() {
  local pid="$1" file="/proc/$pid/stat"
  if [[ ! -r "$file" ]]; then printf 'NA NA'; return; fi
  local line rest
  line="$(cat "$file" 2>/dev/null || true)"
  if [[ -z "$line" || "$line" != *") "* ]]; then printf 'NA NA'; return; fi
  rest="${line##*) }"
  awk '{state=$1; majflt=$10; if(state=="")state="NA"; if(majflt=="")majflt="NA"; print state,majflt}' <<<"$rest"
}

count=0
while read -r pid; do
  [[ -n "$pid" && -d "/proc/$pid" ]] || continue
  (( count += 1 ))
  (( count <= MAX_PIDS )) || break

  read -r STATE MAJFLT <<<"$(read_state_majflt "$pid")"
  WCHAN="NA"
  if [[ -r "/proc/$pid/wchan" ]]; then
    WCHAN="$(tr -d '\n' < "/proc/$pid/wchan" 2>/dev/null || true)"
    WCHAN="${WCHAN//[[:space:]]/_}"
    [[ -n "$WCHAN" ]] || WCHAN="NA"
  fi
  read -r PSS_KB PRIVATE_KB SHARED_KB <<<"$(read_smaps "$pid")"

  READ_BYTES="$(read_io_field "$pid" read_bytes)"
  WRITE_BYTES="$(read_io_field "$pid" write_bytes)"
  RCHAR="$(read_io_field "$pid" rchar)"
  WCHAR="$(read_io_field "$pid" wchar)"
  SYSCR="$(read_io_field "$pid" syscr)"
  SYSCW="$(read_io_field "$pid" syscw)"

  printf 'EXT_PROC pid=%s state=%s wchan=%s pss_kb=%s private_kb=%s shared_kb=%s read_bytes=%s write_bytes=%s rchar=%s wchar=%s syscr=%s syscw=%s majflt=%s\n' \
    "$pid" "${STATE:-NA}" "$WCHAN" \
    "$(safe_num "${PSS_KB:-}")" "$(safe_num "${PRIVATE_KB:-}")" "$(safe_num "${SHARED_KB:-}")" \
    "$(safe_num "$READ_BYTES")" "$(safe_num "$WRITE_BYTES")" "$(safe_num "$RCHAR")" "$(safe_num "$WCHAR")" \
    "$(safe_num "$SYSCR")" "$(safe_num "$SYSCW")" "$(safe_num "${MAJFLT:-}")"
done < <(discover_pids | awk '!seen[$0]++' | head -n "$MAX_PIDS")
