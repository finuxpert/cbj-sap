export const APP_NAME = 'SAP RCA Workspace'
export const APP_VERSION = '1.5.2'

export function formatAppTitle(section = '') {
  return `${section ? `${section} · ` : ''}${APP_NAME} v${APP_VERSION}`
}
