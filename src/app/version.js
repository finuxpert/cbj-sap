export const APP_NAME = 'SAP RCA Workspace'
export const APP_VERSION = '1.2.1'

export function formatAppTitle(section = '') {
  return `${section ? `${section} · ` : ''}${APP_NAME} v${APP_VERSION}`
}
