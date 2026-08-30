export const APP_NAME = 'SAP RCA Workspace'
export const APP_VERSION = '1.9.0'
export const LOG_ANALYTICS_ENGINE = 'duckdb-logical-collection-workload-aggregate-v3'
export const LOG_UI_REVISION = 'collection-first-echarts-virtual-table-v3'

export function formatAppTitle(section = '') {
  return `${section ? `${section} · ` : ''}${APP_NAME} v${APP_VERSION}`
}
