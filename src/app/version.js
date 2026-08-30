export const APP_NAME = 'SAP RCA Workspace'
export const APP_VERSION = '1.11.0'
export const LOG_ANALYTICS_ENGINE = 'role-aware-causal-victim-confidence-v3.3'
export const LOG_UI_REVISION = 'causal-role-confidence-duckdb-diagnostics-v3.3'

export function formatAppTitle(section = '') {
  return `${section ? `${section} · ` : ''}${APP_NAME} v${APP_VERSION}`
}
