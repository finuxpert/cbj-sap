#!/usr/bin/env bash
set -euo pipefail

WORKFLOW_ID="${1:-274021726}"
BRANCH="${2:-dev}"

RUN_ID="$(gh run list \
  --workflow "$WORKFLOW_ID" \
  --branch "$BRANCH" \
  --limit 1 \
  --json databaseId,status,conclusion,displayTitle,createdAt \
  --jq '.[0].databaseId // empty')"

if [[ -z "$RUN_ID" ]]; then
  echo "No GitHub Actions run found for workflow=$WORKFLOW_ID branch=$BRANCH" >&2
  echo "Check with: gh run list --workflow $WORKFLOW_ID --branch $BRANCH --limit 10" >&2
  exit 1
fi

echo "Latest SAPDEV deploy run: $RUN_ID"
gh run view "$RUN_ID" --json databaseId,status,conclusion,displayTitle,createdAt,url --jq '{id:.databaseId,title:.displayTitle,status:.status,conclusion:.conclusion,createdAt:.createdAt,url:.url}'
echo

echo "Watching run $RUN_ID ..."
gh run watch "$RUN_ID"
