export const APP_NAME = 'SAP RCA Workspace'
export const APP_VERSION = '1.12.0'
export const LOG_ANALYTICS_ENGINE = 'incident-verdict-dual-confidence-v3.4'
export const LOG_UI_REVISION = 'verdict-anchor-provenance-diagnostics-v3.4'

export function formatAppTitle(section = '') {
  return `${section ? `${section} · ` : ''}${APP_NAME} v${APP_VERSION}`
}
