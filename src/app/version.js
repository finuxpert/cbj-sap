export const APP_NAME = 'SAP RCA Workspace'
export const APP_VERSION = '1.14.2'
export const LOG_ANALYTICS_ENGINE = 'operator-polish-attribution-guard-v3.6.2'
export const LOG_UI_REVISION = 'operator-console-attribution-pattern-v3.6.2'

export function formatAppTitle(section = '') {
  return `${section ? `${section} · ` : ''}${APP_NAME} v${APP_VERSION}`
}
