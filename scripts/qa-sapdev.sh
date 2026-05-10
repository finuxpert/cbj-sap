#!/usr/bin/env bash
set -euo pipefail

API="${SAPDEV_API:-https://sapdev.cbj-kontruksi.com/sap-api}"
WEB_ROOT="${SAPDEV_WEB_ROOT:-/var/www/svr01-dev/sap}"
RUN_ID="${GITHUB_RUN_ID:-local}"
RUN_ATTEMPT="${GITHUB_RUN_ATTEMPT:-1}"
TITLE="QA Backend Frontend Case ${RUN_ID}-${RUN_ATTEMPT}"

log() {
  printf '\n[qa-sapdev] %s\n' "$*"
}

bundle_grep() {
  local marker="$1"
  local label="$2"
  if grep -R -m1 "${marker}" "${WEB_ROOT}/assets"/*.js >/tmp/qa-marker-hit.txt; then
    echo "OK: ${label} marker found (${marker})"
    head -1 /tmp/qa-marker-hit.txt
  else
    echo "ERROR: ${label} marker missing (${marker})" >&2
    return 1
  fi
}

json_get_case_id() {
  JSON_PAYLOAD="$1" python3 -c 'import json, os
payload=json.loads(os.environ["JSON_PAYLOAD"])
candidate=payload.get("case") or payload.get("item") or payload.get("data") or payload
print(candidate.get("id") or candidate.get("case_no") or payload.get("case_id") or "")'
}

json_find_case_id_by_title() {
  JSON_PAYLOAD="$1" TITLE="$2" python3 -c 'import json, os
payload=json.loads(os.environ["JSON_PAYLOAD"])
items=payload if isinstance(payload, list) else payload.get("items") or payload.get("cases") or payload.get("data") or []
title=os.environ.get("TITLE", "")
match=next((item for item in items if item.get("title") == title), None) or (items[0] if items else {})
print(match.get("id") or match.get("case_no") or match.get("case_id") or "")'
}

assert_case_detail_has_parsed_result() {
  JSON_PAYLOAD="$1" python3 -c 'import json, os
payload=json.loads(os.environ["JSON_PAYLOAD"])
case=payload.get("case") or payload
results=case.get("parsed_results") or []
assert results, "No parsed_results returned from mobile case detail"
assert any(item.get("top_anomaly") == "QA_WORKFLOW_PARSED_RESULT" for item in results), "QA parsed result was not found in case detail"
print("OK: parsed result found")'
}

assert_case_detail_has_evidence() {
  JSON_PAYLOAD="$1" python3 -c 'import json, os
payload=json.loads(os.environ["JSON_PAYLOAD"])
case=payload.get("case") or payload
evidence=case.get("evidence") or []
assert evidence, "No linked evidence returned from mobile case detail"
assert any((item.get("title") or item.get("original_filename") or "").endswith("qa-evidence.txt") for item in evidence), "QA evidence file was not linked to case"
print("OK: linked evidence found")'
}

assert_runtime_source() {
  JSON_PAYLOAD="$1" LABEL="$2" python3 -c 'import json, os
payload=json.loads(os.environ["JSON_PAYLOAD"])
label=os.environ.get("LABEL", "runtime")
assert payload.get("ok", True) is True, f"{label} did not return ok=true"
read_source=payload.get("read_source")
mode=payload.get("mode")
count=payload.get("count")
assert read_source in {"postgres", "file", "legacy_array", None}, f"{label} unexpected read_source={read_source}"
assert mode in {"hybrid", "unknown", None}, f"{label} unexpected mode={mode}"
assert count is None or isinstance(count, int), f"{label} count is not integer"
print(f"OK: {label} read_source={read_source} mode={mode} count={count}")'
}

log "Backend health"
HEALTH=$(curl -fsS "${API}/health")
echo "${HEALTH}"
echo "${HEALTH}" | grep -q 'SAP Intelligent RCA Evidence API'
echo "${HEALTH}" | grep -q '"status":"ok"'

log "Backend hybrid runtime read contracts"
CASES_CONTRACT=$(curl -fsS "${API}/cases?limit=20")
echo "${CASES_CONTRACT}"
assert_runtime_source "${CASES_CONTRACT}" "cases"

EVIDENCE_HISTORY_CONTRACT=$(curl -fsS "${API}/evidence-history?limit=20")
echo "${EVIDENCE_HISTORY_CONTRACT}"
assert_runtime_source "${EVIDENCE_HISTORY_CONTRACT}" "evidence-history"

PARSED_HISTORY_CONTRACT=$(curl -fsS "${API}/parsed-results-history?limit=20")
echo "${PARSED_HISTORY_CONTRACT}"
assert_runtime_source "${PARSED_HISTORY_CONTRACT}" "parsed-results-history"

log "Backend Case History API contract"
CREATE_RESPONSE=$(curl -fsS -X POST "${API}/cases" \
  -H 'Content-Type: application/json' \
  --data "{\"title\":\"${TITLE}\",\"severity\":\"INFO\",\"status\":\"OPEN\",\"summary\":\"QA validation case\",\"created_by\":\"qa-sapdev\"}")
echo "${CREATE_RESPONSE}"

CASE_ID=$(json_get_case_id "${CREATE_RESPONSE}")
if [ -z "${CASE_ID}" ]; then
  log "Create response has no case id; using mobile cases fallback"
  CASE_LIST=$(curl -fsS "${API}/mobile/cases?limit=30")
  CASE_ID=$(json_find_case_id_by_title "${CASE_LIST}" "${TITLE}")
fi

test -n "${CASE_ID}"
log "Case id: ${CASE_ID}"

log "Backend parsed-result persistence"
PARSED_RESPONSE=$(curl -fsS -X POST "${API}/cases/${CASE_ID}/parsed-results" \
  -H 'Content-Type: application/json' \
  --data '{"tool":"QA Workflow Test","verdict":"qa-backend-ok","severity":"WARN","confidence":99,"top_anomaly":"QA_WORKFLOW_PARSED_RESULT","top_suspect":"Case History persistence","summary":"QA verified parsed result persistence.","result_json":{"source":"qa-sapdev","scope":"backend-frontend"}}')
echo "${PARSED_RESPONSE}"
echo "${PARSED_RESPONSE}" | grep -q 'QA_WORKFLOW_PARSED_RESULT'

log "Backend mobile case detail"
DETAIL_RESPONSE=$(curl -fsS "${API}/mobile/cases/${CASE_ID}")
echo "${DETAIL_RESPONSE}"
assert_case_detail_has_parsed_result "${DETAIL_RESPONSE}"

log "Backend linked evidence upload"
TMP_EVIDENCE=$(mktemp)
printf 'QA evidence for %s\n' "${CASE_ID}" > "${TMP_EVIDENCE}"
UPLOAD_RESPONSE=$(curl -fsS -X POST "${API}/upload" \
  -F "file=@${TMP_EVIDENCE};filename=qa-evidence.txt" \
  -F "tool=QA Workflow Test" \
  -F "title=qa-evidence.txt" \
  -F "note=QA linked evidence" \
  -F "tags=qa,case-history" \
  -F "case_id=${CASE_ID}")
rm -f "${TMP_EVIDENCE}"
echo "${UPLOAD_RESPONSE}"
echo "${UPLOAD_RESPONSE}" | grep -q 'qa-evidence.txt'

log "Backend linked evidence in mobile detail"
DETAIL_AFTER_UPLOAD=$(curl -fsS "${API}/mobile/cases/${CASE_ID}")
echo "${DETAIL_AFTER_UPLOAD}"
assert_case_detail_has_evidence "${DETAIL_AFTER_UPLOAD}"

log "Close QA case to avoid OPEN-case pollution"
CLOSE_RESPONSE=$(curl -fsS -X PATCH "${API}/cases/${CASE_ID}" \
  -H 'Content-Type: application/json' \
  --data '{"status":"CLOSED","summary":"QA validation passed; case closed automatically by qa-sapdev."}')
echo "${CLOSE_RESPONSE}"
echo "${CLOSE_RESPONSE}" | grep -q 'CLOSED'

log "Frontend deployed bundle smoke"
test -d "${WEB_ROOT}/assets"
ls -la "${WEB_ROOT}/assets" | head

log "Frontend core RCA tool markers"
bundle_grep "WP-SCOUT" "WP-SCOUT / RCA Comparator"
bundle_grep "ST03N Impact" "ST03N Impact V2"
bundle_grep "Log Evidence" "Log Evidence V2"
bundle_grep "Case History Link" "Log Evidence to Case History panel"
bundle_grep "Save Parsed Summary" "parsed summary save action"
bundle_grep "sap-rca-case-history" "Case History PDF export"
bundle_grep "Export PDF" "PDF export controls"

log "Frontend route markers"
bundle_grep "#/tool/comparer" "WP-SCOUT route"
bundle_grep "#/tool/analyzer" "ST03N route"
bundle_grep "#/tool/logs" "Log Evidence route"
bundle_grep "#/cases" "Case History route"

log "QA PASS: backend API, hybrid reads, case persistence, linked evidence, and all core frontend RCA tool markers verified"
