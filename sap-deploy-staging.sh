#!/usr/bin/env bash
# sap-deploy-staging.sh — Build & deploy SAP staging ke /sap-staging
#
# Usage:
#   sudo ./sap-deploy-staging.sh
#
# Output:
#   http://192.168.10.1/sap-staging/
#
# Catatan:
#   Ini untuk testing internal sebelum deploy production /sap/.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export BASE_PATH="${BASE_PATH:-/sap-staging/}"
export DEPLOY_DIR="${DEPLOY_DIR:-/var/www/html/sap-staging}"
export DO_BACKUP="${DO_BACKUP:-1}"

exec "${SCRIPT_DIR}/sap-deploy.sh" "$@"
