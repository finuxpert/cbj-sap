#!/usr/bin/env bash
set -euo pipefail

log() {
  printf '\n[qa-case-flow-contracts] %s\n' "$*"
}

log "Validate identity-only case create and explicit parsed-result save contract"
TMP_CASE_FLOW_ROOT="$(mktemp -d)" SAP_EVIDENCE_ROOT="$TMP_CASE_FLOW_ROOT" python3 - <<'PY'
import importlib
import os

# Reload storage modules after SAP_EVIDENCE_ROOT override so this QA never touches DEV data.
import backend.storage_config as storage_config
storage_config = importlib.reload(storage_config)

import backend.storage_helpers as storage_helpers
storage_helpers = importlib.reload(storage_helpers)

import backend.case_service as case_service
case_service = importlib.reload(case_service)

import backend.parsed_result_service as parsed_result_service
parsed_result_service = importlib.reload(parsed_result_service)

from backend.models import CaseCreate, ParsedResultCreate

storage_helpers.ensure_dirs()

created = case_service.create_case_item(CaseCreate(
    title='ISSUE-QA H1P PRD identity only flow',
    sid='H1P',
    environment='PRD',
    severity='WARN',
    status='OPEN',
    case_stage='CLASSIFIED',
    summary='SHOULD_NOT_BE_USED_ON_CREATE',
    top_anomaly='SHOULD_NOT_BE_USED_ON_CREATE',
    top_suspect='SHOULD_NOT_BE_USED_ON_CREATE',
    created_by='qa-case-flow',
))

case_id = created['case']['id']
case_data = storage_helpers.read_case(case_id)

assert created['ok'] is True
assert case_data['title'] == 'ISSUE-QA H1P PRD identity only flow'
assert case_data['sid'] == 'H1P'
assert case_data['environment'] == 'PRD'
assert case_data['severity'] == 'WARN', case_data
assert case_data['status'] == 'OPEN'
assert case_data['case_stage'] == 'CLASSIFIED'
assert case_data['summary'] == 'SHOULD_NOT_BE_USED_ON_CREATE'
assert case_data['top_anomaly'] == 'SHOULD_NOT_BE_USED_ON_CREATE'
assert case_data['top_suspect'] == 'SHOULD_NOT_BE_USED_ON_CREATE'
assert case_data['parsed_results'] == []

# Real identity-only frontend flow sends empty summary/anomaly/suspect regardless of analyzer suggestions.
identity_created = case_service.create_case_item(CaseCreate(
    title='ISSUE-QA H1P PRD frontend identity only',
    sid='H1P',
    environment='PRD',
    severity='INFO',
    status='OPEN',
    case_stage='INTAKE',
    summary='',
    top_anomaly='',
    top_suspect='',
    created_by='qa-case-flow',
))
identity_id = identity_created['case']['id']
identity_case = storage_helpers.read_case(identity_id)
assert identity_case['severity'] == 'INFO'
assert identity_case['status'] == 'OPEN'
assert identity_case['case_stage'] == 'INTAKE'
assert identity_case['summary'] == ''
assert identity_case['top_anomaly'] == ''
assert identity_case['top_suspect'] == ''
assert identity_case['parsed_results'] == []

saved = parsed_result_service.add_case_parsed_result(identity_id, ParsedResultCreate(
    tool='Log Evidence V2',
    verdict='CONVT_NO_NUMBER detected',
    severity='CRIT',
    confidence=92,
    top_anomaly='CONVT_NO_NUMBER',
    top_suspect='ABAP conversion issue',
    summary='Parser found conversion dump in uploaded evidence.',
    sid='H1P',
    environment='PRD',
    result_json={
        'summary': 'Parser found conversion dump in uploaded evidence.',
        'primary': {'name': 'CONVT_NO_NUMBER'},
    },
))

updated = storage_helpers.read_case(identity_id)
assert saved['ok'] is True
assert len(updated['parsed_results']) == 1
assert updated['case_stage'] == 'CLASSIFIED'
assert updated['severity'] == 'CRIT'
assert updated['sid'] == 'H1P'
assert updated['environment'] == 'PRD'

# Critical regression guard: parsed result must not overwrite case-level identity fields.
assert updated['title'] == 'ISSUE-QA H1P PRD frontend identity only'
assert updated['summary'] == ''
assert updated['top_anomaly'] == ''
assert updated['top_suspect'] == ''

result = updated['parsed_results'][0]
assert result['summary'] == 'Parser found conversion dump in uploaded evidence.'
assert result['top_anomaly'] == 'CONVT_NO_NUMBER'
assert result['top_suspect'] == 'ABAP_CONVERSION_DATA_FORMAT'
assert result['original_top_suspect'] == 'ABAP conversion issue'
assert result['normalized_rca']['sid'] == 'H1P'
assert result['normalized_rca']['environment'] == 'PRD'

print('OK: case flow contract keeps identity stable and stores RCA in parsed_results')
PY

log "Case flow contract QA PASS"
