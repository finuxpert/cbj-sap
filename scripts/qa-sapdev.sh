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

log "Backend health"
HEALTH=$(curl -fsS "${API}/health")
echo "${HEALTH}"
echo "${HEALTH}" | grep -q 'SAP Intelligent RCA Evidence API'

log "Create QA case"
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

log "Save parsed result"
PARSED_RESPONSE=$(curl -fsS -X POST "${API}/cases/${CASE_ID}/parsed-results" \
  -H 'Content-Type: application/json' \
  --data '{"tool":"QA Workflow Test","verdict":"qa-backend-ok","severity":"WARN","confidence":99,"top_anomaly":"QA_WORKFLOW_PARSED_RESULT","top_suspect":"Case History persistence","summary":"QA verified parsed result persistence.","result_json":{"source":"qa-sapdev","scope":"backend-frontend"}}')
echo "${PARSED_RESPONSE}"
echo "${PARSED_RESPONSE}" | grep -q 'QA_WORKFLOW_PARSED_RESULT'

log "Verify mobile case detail parsed result"
DETAIL_RESPONSE=$(curl -fsS "${API}/mobile/cases/${CASE_ID}")
echo "${DETAIL_RESPONSE}"
assert_case_detail_has_parsed_result "${DETAIL_RESPONSE}"

log "Upload linked QA evidence"
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

log "Verify linked evidence in mobile case detail"
DETAIL_AFTER_UPLOAD=$(curl -fsS "${API}/mobile/cases/${CASE_ID}")
echo "${DETAIL_AFTER_UPLOAD}"
assert_case_detail_has_evidence "${DETAIL_AFTER_UPLOAD}"

log "Frontend deployed bundle smoke"
test -d "${WEB_ROOT}/assets"
ls -la "${WEB_ROOT}/assets" | head

grep -R "Case History Link" "${WEB_ROOT}/assets"/*.js | head -1
grep -R "Save Parsed Summary" "${WEB_ROOT}/assets"/*.js | head -1
grep -R "sap-rca-case-history" "${WEB_ROOT}/assets"/*.js | head -1
grep -R "Export PDF" "${WEB_ROOT}/assets"/*.js | head -1

log "QA PASS: backend API, case persistence, linked evidence, and frontend bundle smoke verified"
