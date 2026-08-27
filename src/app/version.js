export const APP_NAME = 'SAP RCA Workspace'
export const APP_VERSION = '1.5.9'
export const LOG_ANALYTICS_ENGINE = 'deterministic-v1.2'
export const LOG_UI_REVISION = 'materiality-recovery-v1'

export function formatAppTitle(section = '') {
  return `${section ? `${section} · ` : ''}${APP_NAME} v${APP_VERSION}`
}
