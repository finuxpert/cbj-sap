export const APP_NAME = 'SAP RCA Workspace'
export const APP_VERSION = '1.7.0'
export const LOG_ANALYTICS_ENGINE = 'automatic-peak-correlation-v1'
export const LOG_UI_REVISION = 'time-first-landscape-peak-v1'

export function formatAppTitle(section = '') {
  return `${section ? `${section} · ` : ''}${APP_NAME} v${APP_VERSION}`
}
