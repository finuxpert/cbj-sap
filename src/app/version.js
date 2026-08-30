export const APP_NAME = 'SAP RCA Workspace'
export const APP_VERSION = '1.14.5'
export const LOG_ANALYTICS_ENGINE = 'legacy-final-ui-semantics-v3.6.4'
export const LOG_UI_REVISION = 'operator-console-plain-language-v3.6.5'

export function formatAppTitle(section = '') {
  return `${section ? `${section} · ` : ''}${APP_NAME} v${APP_VERSION}`
}
