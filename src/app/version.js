export const APP_NAME = 'SAP RCA Workspace'
export const APP_VERSION = '1.9.1'
export const LOG_ANALYTICS_ENGINE = 'duckdb-accuracy-hardened-workload-aggregate-v3.1'
export const LOG_UI_REVISION = 'resource-operational-peak-mapping-confidence-v3.1'

export function formatAppTitle(section = '') {
  return `${section ? `${section} · ` : ''}${APP_NAME} v${APP_VERSION}`
}
