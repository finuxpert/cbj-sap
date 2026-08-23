import JSZip from 'jszip'
import { listEvidence } from '../evidence-api-client.js'

export const safe = (value) => String(value ?? '').trim()
export const lower = (value) => safe(value).toLowerCase()
export const fileExt = (name = '') => name.split('.').pop()?.toLowerCase() || ''
export const fmt = (value, digits = 1) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: digits })

export function toNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  let text = safe(value).replace(/\u00a0/g, '').replace(/\s+/g, '')
  if (!text) return fallback
  if (text.includes(',') && text.includes('.')) {
    text = text.lastIndexOf(',') > text.lastIndexOf('.') ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '')
  } else {
    text = text.replace(',', '.')
  }
  text = text.replace(/[^0-9.-]/g, '')
  const parsed = Number.parseFloat(text)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0))
}

export function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function latestRcaSession() {
  return loadJson('sap_rca_investigation_sessions_v1', [])[0] || null
}

export async function expandZipAwareFiles(fileList, allowedExts = []) {
  const input = Array.from(fileList || [])
  const output = []
  const allow = new Set(allowedExts.map((x) => x.toLowerCase()))
  for (const file of input) {
    if (fileExt(file.name) !== 'zip') {
      if (!allow.size || allow.has(fileExt(file.name))) output.push(file)
      continue
    }
    const zip = await JSZip.loadAsync(file)
    for (const entry of Object.values(zip.files)) {
      if (entry.dir || entry.name.startsWith('__MACOSX')) continue
      const blob = await entry.async('blob')
      const name = entry.name.split('/').pop() || entry.name
      if (!allow.size || allow.has(fileExt(name))) {
        output.push(new File([blob], name, { type: blob.type || 'application/octet-stream', lastModified: file.lastModified }))
      }
    }
  }
  return output
}

export async function getRecentEvidence(params = { tool: 'investigation', limit: 5 }) {
  try {
    return await listEvidence(params)
  } catch (error) {
    return { ok: false, error: error?.message || String(error) }
  }
}

export function fileSizeLabel(bytes = 0) {
  const value = Number(bytes || 0)
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${value} B`
}

export function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function copyText(text) {
  if (navigator?.clipboard?.writeText) return navigator.clipboard.writeText(text)
  const input = document.createElement('textarea')
  input.value = text
  document.body.appendChild(input)
  input.select()
  document.execCommand('copy')
  input.remove()
  return Promise.resolve()
}

export const ERROR_FAMILY = [
  { pattern: /CONVT_NO_NUMBER/i, family: 'ABAP conversion / data format issue', owner: 'ABAP / Functional data owner', meaning: 'Numeric conversion failed. Focus on input values, formatting, and job data source.' },
  { pattern: /DBSQL|DUPLICATE_KEY|SQL/i, family: 'Database/application data consistency issue', owner: 'ABAP / Functional / Data owner', meaning: 'Duplicate key or SQL issue. Focus on data consistency and insert/update logic.' },
  { pattern: /TIME_OUT/i, family: 'Timeout / long-running processing', owner: 'ABAP / Basis', meaning: 'Processing exceeded runtime threshold. Focus on runtime, loops, SQL, or batch size.' },
  { pattern: /CALL_FUNCTION|RFC|SEND_ERR/i, family: 'RFC / communication function error', owner: 'Basis / Integration', meaning: 'Remote/function call failed. Focus on destination, network, target system, or payload.' },
  { pattern: /SYNTAX|LOAD_PROGRAM|PROGRAM/i, family: 'ABAP program load/runtime issue', owner: 'ABAP', meaning: 'Program/load issue. Focus on transport, generation, syntax, or runtime load state.' },
  { pattern: /UNCAUGHT_EXCEPTION|EXCEPTION/i, family: 'Unhandled ABAP exception', owner: 'ABAP', meaning: 'Exception was not handled. Focus on exception path and input condition.' },
]

export function classifySapError(errorCode = '') {
  return ERROR_FAMILY.find((item) => item.pattern.test(errorCode)) || {
    family: 'Unclassified SAP runtime/log pattern',
    owner: 'Basis triage',
    meaning: 'Pattern detected but not classified. Continue with raw evidence review.',
  }
}

export function buildOwnerAction(errorGroup) {
  if (!errorGroup) return 'Upload evidence and run analysis first.'
  const subject = errorGroup.jobs?.[0] || errorGroup.programs?.[0] || errorGroup.name
  const window = errorGroup.times?.join(', ') || 'uploaded evidence window'
  return `Focus ${errorGroup.owner}: review ${subject} around ${window}. Primary pattern: ${errorGroup.name}.`
}
