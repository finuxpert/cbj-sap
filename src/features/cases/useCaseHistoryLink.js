import React from 'react'
import { createCase, listMobileCases, saveParsedResult, uploadEvidence } from '../../evidence-api-client.js'
import { caseItemId, findFallbackCase, normalizeCaseId, normalizeCaseList } from './caseHistoryLinkUtils.js'

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
    severity: suggested.severity || 'INFO',
    status: suggested.status || 'OPEN',
    case_stage: suggested.case_stage || 'INTAKE',
    summary: suggested.summary || '',
    top_anomaly: suggested.top_anomaly || '',
    top_suspect: suggested.top_suspect || '',
    created_by: suggested.created_by || 'sphere-workspace',
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

function normalizeDbFailure(detail = '') {
  const text = String(detail || '').trim()
  if (!text) return 'DB write failed.'
  if (text.toLowerCase().startsWith('db write failed')) return text
  return `DB write failed: ${text}`
}

function backendErrorMessage(response = {}, fallback = 'Failed to create case') {
  const status = response?.status ? `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}` : ''
  const detail = response?.detail || response?.message || response?.error || response?.raw || ''
  const raw = !detail ? compactJson(response) : ''
  const normalizedDetail = Number(response?.status || 0) === 503 ? normalizeDbFailure(detail || raw) : (detail || raw)
  return [fallback, status, normalizedDetail].filter(Boolean).join(' — ')
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

function readStoredCaseId(storageKey, loadJson) {
  if (!storageKey || !loadJson) return ''
  const stored = loadJson(storageKey, '')
  if (typeof stored === 'string') return stored
  return normalizeCaseId(stored)
}

export default function useCaseHistoryLink({
  storageKey,
  buildCasePayload,
  buildParsedPayload,
  defaultCaseTitle = 'SPHERE Case',
  toolName = 'SPHERE',
  uploadLimit = 20,
  uploadTags = [],
  requireExplicitSaveIntent = false,
  loadJson,
  saveJson,
}) {
  const [recentCases, setRecentCases] = React.useState([])
  const [caseId, setCaseIdState] = React.useState(() => readStoredCaseId(storageKey, loadJson))
  const [caseTitle, setCaseTitle] = React.useState('')
  const [savingCase, setSavingCase] = React.useState(false)
  const [creatingCase, setCreatingCase] = React.useState(false)
  const [saveStatus, setSaveStatus] = React.useState('')

  const writeStoredCaseId = React.useCallback((nextCaseId = '') => {
    if (!storageKey || !saveJson) return false
    return saveJson(storageKey, nextCaseId || '')
  }, [saveJson, storageKey])

  const setCaseId = React.useCallback((nextCaseId) => {
    setCaseIdState(nextCaseId || '')
    writeStoredCaseId(nextCaseId || '')
    if (nextCaseId) {
      setCaseTitle('')
      setSaveStatus('Selected case is ready. Click Save to Case History.')
    } else {
      setSaveStatus('')
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
    setSaveStatus('')
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

  const persistAnalysis = React.useCallback(async (analysis, files = [], context = {}, options = {}) => {
    const normalizedContext = normalizeContext(context)
    if (!caseId || !analysis || !buildParsedPayload) {
      setSaveStatus(!analysis ? 'Upload and analyze evidence first.' : 'Create or link a case first.')
      return
    }
    if (caseTitle.trim()) {
      setSaveStatus('Click Create Case to link this analysis to a new DB case.')
      return
    }
    if (requireExplicitSaveIntent && options?.explicitSaveIntent !== true) {
      setSaveStatus('Save blocked: click Save to Case History explicitly after create/select case. Upload & Analyze does not write Case History.')
      return
    }
    setSavingCase(true)
    setSaveStatus('Saving…')
    try {
      const payload = buildParsedPayload(analysis, normalizedContext)
      const saved = await saveParsedResult(caseId, payload)
      if (saved?.ok === false) {
        const detail = Number(saved?.status || 0) === 503
          ? normalizeDbFailure(saved?.detail || saved?.raw)
          : (saved?.detail || saved?.raw || 'Failed to save parsed result')
        const saveError = new Error(detail)
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
        if (response?.ok === false) {
          const detail = Number(response?.status || 0) === 503
            ? normalizeDbFailure(response?.detail || response?.raw)
            : (response?.detail || response?.raw || 'Failed to upload evidence metadata')
          const uploadError = new Error(detail)
          uploadError.status = response?.status
          throw uploadError
        }
        uploaded += 1
      }

      setSaveStatus(`Saved to ${caseId}. Linked evidence files: ${uploaded}.`)
      loadCases()
    } catch (error) {
      if (isMissingCaseError(error)) {
        clearCaseId('Linked case was not found in DB. Create or link a case first.')
      } else {
        setSaveStatus(error?.message || 'Failed to save parsed summary.')
      }
    } finally {
      setSavingCase(false)
    }
  }, [buildParsedPayload, caseId, caseTitle, clearCaseId, loadCases, requireExplicitSaveIntent, toolName, uploadLimit, uploadTags])

  const createLinkedCase = React.useCallback(async (analysis, context = {}) => {
    if (savingCase || creatingCase) return ''
    if (!caseTitle.trim()) {
      setSaveStatus('Enter a case title first.')
      return ''
    }
    const normalizedContext = normalizeContext(context)
    setCreatingCase(true)
    setSaveStatus('Creating…')
    try {
      const title = caseTitle.trim() || defaultCaseTitle
      const suggestedPayload = analysis && buildCasePayload ? buildCasePayload(analysis, title, normalizedContext) : {}
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
      const reloadNote = visibleAfterReload ? '' : ' The recent list may still be refreshing.'
      const nextStep = analysis ? 'Click Save to Case History next.' : 'Upload and analyze evidence, then Save to Case History.'
      setSaveStatus(`New case created and linked: ${nextId}${dbStatus ? ` (${dbStatus})` : ''}. ${nextStep}${reloadNote}`)
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
