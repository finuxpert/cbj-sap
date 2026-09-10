export const APP_NAME = 'SPHERE'
export const APP_TAGLINE = 'SAP Performance Health Evaluation & Reporting'
export const APP_VERSION = '1.18.6'
export const APP_PREVIOUS_VERSION = '1.18.5'
export const APP_BUILD = String(import.meta.env.VITE_GIT_SHA || '').slice(0, 7)
export const APP_ENV = String(import.meta.env.VITE_APP_ENV || '')
export const APP_IS_DEV = /dev/i.test(APP_ENV) || String(import.meta.env.BASE_URL || '').includes('dev')
export const APP_DISPLAY_VERSION = `v${APP_VERSION}${APP_IS_DEV ? '-dev' : ''}${APP_BUILD ? ` · ${APP_BUILD}` : ''}`
export const APP_BUILD_LABEL = `Build ${APP_DISPLAY_VERSION}`
export const LOG_ANALYTICS_ENGINE = 'legacy-final-ui-semantics-v3.6.4'
export const LOG_UI_REVISION = 'alert-incident-lifecycle-v1.18.6'

export function formatAppTitle(section = '') {
  return `${section ? `${section} · ` : ''}${APP_NAME} v${APP_VERSION}`
}
