export const APP_NAME = 'SAP RCA Workspace'
export const APP_VERSION = '1.8.1'
export const LOG_ANALYTICS_ENGINE = 'duckdb-resource-correlation-v2.1'
export const LOG_UI_REVISION = 'time-first-echarts-virtual-table-v2.1'

export function formatAppTitle(section = '') {
  return `${section ? `${section} · ` : ''}${APP_NAME} v${APP_VERSION}`
}
