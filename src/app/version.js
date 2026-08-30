export const APP_NAME = 'SAP RCA Workspace'
export const APP_VERSION = '1.14.0'
export const LOG_ANALYTICS_ENGINE = 'enhanced-telemetry-error-taxonomy-v3.6'
export const LOG_UI_REVISION = 'pss-wchan-psi-io-pattern-v2-v3.6'

export function formatAppTitle(section = '') {
  return `${section ? `${section} · ` : ''}${APP_NAME} v${APP_VERSION}`
}
