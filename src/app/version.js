export const APP_NAME = 'SAP RCA Workspace'
export const APP_VERSION = '1.14.3'
export const LOG_ANALYTICS_ENGINE = 'source-provenance-operator-final-v3.6.3'
export const LOG_UI_REVISION = 'operator-console-provenance-timing-v3.6.3'

export function formatAppTitle(section = '') {
  return `${section ? `${section} · ` : ''}${APP_NAME} v${APP_VERSION}`
}
