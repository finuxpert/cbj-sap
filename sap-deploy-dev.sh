#!/usr/bin/env bash
# sap-deploy-dev.sh — Build & deploy SAP dev ke sapdev.cbj-kontruksi.com
#
# Usage:
#   sudo ./sap-deploy-dev.sh
#
# Default:
#   BASE_PATH=/
#   DEPLOY_DIR=/var/www/html/sapdev
#
# Override if nginx root berbeda:
#   sudo DEPLOY_DIR=/path/to/sapdev ./sap-deploy-dev.sh

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export BASE_PATH="${BASE_PATH:-/}"
export DEPLOY_DIR="${DEPLOY_DIR:-/var/www/html/sapdev}"
export DO_BACKUP="${DO_BACKUP:-0}"

exec "${SCRIPT_DIR}/sap-deploy.sh" "$@"
