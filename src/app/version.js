export const APP_NAME = 'SAP RCA Workspace'
export const APP_VERSION = '1.10.0'
export const LOG_ANALYTICS_ENGINE = 'duckdb-incident-relative-workload-ranking-v3.2'
export const LOG_UI_REVISION = 'load1-calibrated-landscape-incident-v3.2.0'

export function formatAppTitle(section = '') {
  return `${section ? `${section} · ` : ''}${APP_NAME} v${APP_VERSION}`
}
