export const APP_NAME = 'SAP RCA Workspace'
export const APP_VERSION = '1.14.1'
export const LOG_ANALYTICS_ENGINE = 'operator-accuracy-stabilization-v3.6.1'
export const LOG_UI_REVISION = 'operator-console-compact-ranking-v3.6.1'

export function formatAppTitle(section = '') {
  return `${section ? `${section} · ` : ''}${APP_NAME} v${APP_VERSION}`
}
