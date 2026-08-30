export const APP_NAME = 'SAP RCA Workspace'
export const APP_VERSION = '1.11.1'
export const LOG_ANALYTICS_ENGINE = 'minute-aware-host-gated-causal-ranking-v3.3.1'
export const LOG_UI_REVISION = 'temporal-severity-cpu-scale-hotfix-v3.3.1'

export function formatAppTitle(section = '') {
  return `${section ? `${section} · ` : ''}${APP_NAME} v${APP_VERSION}`
}
