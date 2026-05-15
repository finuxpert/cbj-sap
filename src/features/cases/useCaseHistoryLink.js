import React from 'react'
import { createCase, listMobileCases, saveParsedResult, uploadEvidence } from '../../evidence-api-client.js'
import { caseItemId, findFallbackCase, normalizeCaseId, normalizeCaseList } from './caseHistoryLinkUtils.js'

const EXPLICIT_SAVE_WINDOW_MS = 8000

function isMissingCaseError(error) {
  const message = String(error?.message || error?.detail || error?.raw || '').toLowerCase()
  return Number(error?.status || 0) === 404 || message.includes('404') || message.includes('not found')
}

function normalizeContext(context = {}) {
  const sid = String(context?.sid || '').trim().toUpperCase()
  const environment = String(context?.environment || '').trim().toUpperCase()
  return {
    ...context,
    sid,
    environment,
  }
}

function uploadTagsFor(baseTags = [], context = {}) {
  return [
    ...baseTags,
    context.sid,
    context.environment,
  ].filter(Boolean)
}

function buildIdentityOnlyCasePayload(title, suggested = {}, context = {}) {
  return {
    title,
    sid: context.sid || suggested.sid || '',
    environment: context.environment || suggested.environment || '',
    severity: 'INFO',
    status: 'OPEN',
    case_stage: 'INTAKE',
    summary: '',
    top_anomaly: '',
    top_suspect: '',
    created_by: suggested.created_by || 'sap-rca-workspace',
  }
}

function compactJson(value) {
  if (!value) return ''
  if (typeof value === 'string') return value.slice(0, 260)
  try {
    return JSON.stringify(value).slice(0, 260)
  } catch {
    return String(value).slice(0, 260)
  }
}

function backendErrorMessage(response = {}, fallback = 'Failed to create case') {
  const status = response?.status ? `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}` : ''
  const detail = response?.detail || response?.message || response?.error || response?.raw || ''
  const raw = !detail ? compactJson(response) : ''
  return [fallback, status, detail || raw].filter(Boolean).join(' — ')
}

function normalizeCreatedCaseId(response = {}) {
  const candidates = [
    response?.case,
    response?.item,
    response?.data,
    response?.result,
    response,
  ]

  for (const candidate of candidates) {
    const nextId = normalizeCaseId(candidate)
      || candidate?.case_id
      || candidate?.caseNo
      || candidate?.case_no
      || candidate?.id
    if (nextId) return String(nextId)
  }

  return ''
}

function dbWriteSuffix(response = {}) {
  const dbWrite = response?.db_write
  if (!dbWrite || typeof dbWrite !== 'object') return ''
  const enabled = dbWrite.enabled === false ? 'disabled' : 'enabled'
  const written = dbWrite.written === false ? 'not written' : dbWrite.written === true ? 'written' : ''
  const status = dbWrite.status ? `status ${dbWrite.status}` : ''
  return [enabled, written, status].filter(Boolean).join(', ')
}

function hasRecentExplicitSaveIntent() {
  if (typeof window === 'undefined') return false
  const lastIntent = Number(window.__SAP_RCA_EXPLICIT_CASE_SAVE_TS__ || 0)
  if (!lastIntent) return false
  return Date.now() - lastIntent <= EXPLICIT_SAVE_WINDOW_MS
}

export default function useCaseHistoryLink({
  storageKey,
  buildCasePayload,
  buildParsedPayload,
  defaultCaseTitle = 'SAP RCA Case',
  toolName = 'SAP RCA Workspace',
  uploadLimit = 20,
  uploadTags = [],
  requireExplicitSaveIntent = false,
  saveJson,
}) {
  const [recentCases, setRecentCases] = React.useState([])
  const [caseId, setCaseIdState] = React.useState('')
  const [caseTitle, setCaseTitle] = React.useState('')
  const [savingCase, setSavingCase] = React.useState(false)
  const [creatingCase, setCreatingCase] = React.useState(false)
  const [saveStatus, setSaveStatus] = React.useState('')

  const writeStoredCaseId = React.useCallback(() => {
    // Intentional no-op: case selection must be explicit per tool session.
    // Persisting selected case IDs causes stale local links and accidental saves
    // to an old incident after reload or when switching tools.
    void storageKey
    void saveJson
  }, [saveJson, storageKey])

  const setCaseId = React.useCallback((nextCaseId) => {
    setCaseIdState(nextCaseId || '')
    writeStoredCaseId(nextCaseId || '')
    if (nextCaseId) {
      setCaseTitle('')
      setSaveStatus(`Case selected: ${nextCaseId}`)
    } else {
      setSaveStatus('Not linked. Create/select case first, then save parsed summary and evidence.')
    }
  }, [writeStoredCaseId])

  const clearCaseId = React.useCallback((message = '') => {
    setCaseIdState('')
    writeStoredCaseId('')
    if (message) setSaveStatus(message)
  }, [writeStoredCaseId])

  const setNewCaseTitle = React.useCallback((nextTitle = '') => {
    if (caseId) {
      setCaseIdState('')
      writeStoredCaseId('')
    }
    setCaseTitle(nextTitle)
    if (String(nextTitle || '').trim()) {
      setSaveStatus('New case title active. Click Create Case first, then save parsed summary.')
    }
  }, [caseId, writeStoredCaseId])

  const loadCases = React.useCallback(async () => {
    try {
      const response = await listMobileCases({ limit: 20 })
      const items = normalizeCaseList(response)
      setRecentCases(items)
      return items
    } catch {
      setRecentCases([])
      return []
    }
  }, [])

  React.useEffect(() => {
    loadCases()
  }, [loadCases])

  const persistAnalysis = React.useCallback(async (analysis, files = [], context = {}) => {
    const normalizedContext = normalizeContext(context)
    if (!caseId || !analysis || !buildParsedPayload) {
      setSaveStatus('Create/select case first, then save parsed summary and evidence.')
      return
    }
    if (caseTitle.trim()) {
      setSaveStatus('New case title is active. Click Create Case first, then save parsed summary.')
      return
    }
    if (requireExplicitSaveIntent && !hasRecentExplicitSaveIntent()) {
      setSaveStatus('Save blocked: click Save to Case History explicitly after create/select case. Upload & Analyze does not write Case History.')
      return
    }
    setSavingCase(true)
    setSaveStatus('Saving parsed summary to Case History…')
    try {
      const payload = buildParsedPayload(analysis, normalizedContext)
      const saved = await saveParsedResult(caseId, payload)
      if (saved?.ok === false) {
        const saveError = new Error(saved?.detail || saved?.raw || 'Failed to save parsed result')
        saveError.status = saved?.status
        throw saveError
      }

      let uploaded = 0
      for (const file of (files || []).slice(0, uploadLimit)) {
        const response = await uploadEvidence(file, {
          case_id: caseId,
          tool: toolName,
          sid: normalizedContext.sid || payload?.sid || payload?.result_json?.sid || '',
          title: file.name,
          note: normalizedContext.environment ? `Environment: ${normalizedContext.environment}` : '',
          tags: uploadTagsFor(uploadTags, normalizedContext),
        })
        if (response?.ok !== false) uploaded += 1
      }

      setSaveStatus(`Saved to ${caseId}. Linked evidence files: ${uploaded}.`)
      loadCases()
    } catch (error) {
      if (isMissingCaseError(error)) {
        clearCaseId('Linked case was not found in DB. Cleared stale local case id. Create/select case first, then save parsed summary and evidence.')
      } else {
        setSaveStatus(error?.message || 'Failed to save parsed summary.')
      }
    } finally {
      setSavingCase(false)
    }
  }, [buildParsedPayload, caseId, caseTitle, clearCaseId, loadCases, requireExplicitSaveIntent, toolName, uploadLimit, uploadTags])

  const createLinkedCase = React.useCallback(async (analysis, context = {}) => {
    if (savingCase || creatingCase) return ''
    const normalizedContext = normalizeContext(context)
    setCreatingCase(true)
    setSaveStatus('Creating new case…')
    try {
      const title = caseTitle.trim() || defaultCaseTitle
      const suggestedPayload = buildCasePayload ? buildCasePayload(analysis, title, normalizedContext) : {}
      const payload = buildIdentityOnlyCasePayload(title, suggestedPayload, normalizedContext)

      const response = await createCase(payload)
      if (response?.ok === false) {
        throw new Error(backendErrorMessage(response))
      }

      let nextId = normalizeCreatedCaseId(response)
      if (!nextId) {
        const refreshedCases = await loadCases()
        const fallback = findFallbackCase(refreshedCases, payload.title || title)
        nextId = caseItemId(fallback)
      }

      if (!nextId) {
        throw new Error(`Case create response did not include a selectable id. Response: ${compactJson(response) || 'empty response'}`)
      }

      setCaseIdState(nextId)
      writeStoredCaseId(nextId)
      setCaseTitle('')
      const refreshedCases = await loadCases()
      const dbStatus = dbWriteSuffix(response)
      const visibleAfterReload = refreshedCases.some((item) => caseItemId(item) === nextId)
      const reloadNote = visibleAfterReload ? 'visible in Case History' : 'created, but not visible in recent list yet; hard refresh may be needed'
      setSaveStatus(`New case created and linked: ${nextId}${dbStatus ? ` (${dbStatus})` : ''}. ${reloadNote}. Click Save to Case History next.`)
      return nextId
    } catch (error) {
      setSaveStatus(error?.message || 'Failed to create case.')
      return ''
    } finally {
      setCreatingCase(false)
    }
  }, [buildCasePayload, caseTitle, creatingCase, defaultCaseTitle, loadCases, savingCase, writeStoredCaseId])

  return {
    recentCases,
    caseId,
    caseTitle,
    savingCase: savingCase || creatingCase,
    creatingCase,
    saveStatus,
    setCaseId,
    setCaseTitle: setNewCaseTitle,
    clearCaseId,
    loadCases,
    persistAnalysis,
    createLinkedCase,
  }
}
