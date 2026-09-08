export const APP_NAME = 'SPHERE'
export const APP_TAGLINE = 'SAP Performance Health Evaluation & Reporting'
export const APP_VERSION = '1.15.1'
export const LOG_ANALYTICS_ENGINE = 'legacy-final-ui-semantics-v3.6.4'
export const LOG_UI_REVISION = 'collector-v22-ingestion-v3.7.0'

export function formatAppTitle(section = '') {
  return `${section ? `${section} · ` : ''}${APP_NAME} v${APP_VERSION}`
}
