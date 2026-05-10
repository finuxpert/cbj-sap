#!/usr/bin/env bash
set -euo pipefail

REPO="${REPO:-finuxpert/cbj-sap}"
REF="${REF:-dev}"
WORKFLOW="${WORKFLOW:-backend-safe-refactor.yml}"
CONFIRM="${CONFIRM:-APPLY_BACKEND_REFACTOR}"

log() {
  printf '\n[backend-safe-refactor] %s\n' "$*"
}

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: GitHub CLI gh is required." >&2
  exit 1
fi

log "Repository: ${REPO}"
log "Branch: ${REF}"
log "Workflow: ${WORKFLOW}"

log "Triggering backend safe refactor workflow"
gh workflow run "${WORKFLOW}" \
  --repo "${REPO}" \
  --ref "${REF}" \
  -f CONFIRM_BACKEND_REFACTOR="${CONFIRM}"

log "Latest runs"
gh run list --repo "${REPO}" --workflow "${WORKFLOW}" --limit 5

cat <<'EOF'

Next commands:
  gh run watch --repo finuxpert/cbj-sap
  gh run view --repo finuxpert/cbj-sap --log-failed

Expected flow:
  1. backend-safe-refactor.yml runs model refactor
  2. backend QA passes
  3. storage refactor runs
  4. backend QA passes again
  5. workflow commits refactor diff to dev
  6. deploy-sapdev.yml auto-runs from the new dev commit
EOF
