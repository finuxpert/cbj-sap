import React from 'react'
import { createCase, listMobileCases, saveParsedResult, uploadEvidence } from '../../evidence-api-client.js'
import { caseItemId, findFallbackCase, normalizeCaseId, normalizeCaseList } from './caseHistoryLinkUtils.js'

function isMissingCaseError(error) {
  const message = String(error?.message || error?.detail || error?.raw || '').toLowerCase()
  return Number(error?.status || 0) === 404 || message.includes('404') || message.includes('not found')
}

export default function useCaseHistoryLink({
  storageKey,
  buildCasePayload,
  buildParsedPayload,
  defaultCaseTitle = 'SAP RCA Case',
  toolName = 'SAP RCA Workspace',
  uploadLimit = 20,
  uploadTags = [],
  saveJson,
}) {
  const [recentCases, setRecentCases] = React.useState([])
  const [caseId, setCaseIdState] = React.useState('')
  const [caseTitle, setCaseTitle] = React.useState('')
  const [savingCase, setSavingCase] = React.useState(false)
  const [saveStatus, setSaveStatus] = React.useState('')

  const writeStoredCaseId = React.useCallback((nextCaseId) => {
    if (!storageKey) return
    if (saveJson) {
      saveJson(storageKey, nextCaseId || '')
      return
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(nextCaseId || ''))
    } catch {
      // selected case is convenience cache only
    }
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

  const persistAnalysis = React.useCallback(async (analysis, files = []) => {
    if (!caseId || !analysis || !buildParsedPayload) {
      setSaveStatus('Create/select case first, then save parsed summary and evidence.')
      return
    }
    if (caseTitle.trim()) {
      setSaveStatus('New case title is active. Click Create Case first, then save parsed summary.')
      return
    }
    setSavingCase(true)
    setSaveStatus('Saving parsed summary to Case History…')
    try {
      const saved = await saveParsedResult(caseId, buildParsedPayload(analysis))
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
          title: file.name,
          tags: uploadTags,
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
  }, [buildParsedPayload, caseId, caseTitle, clearCaseId, loadCases, toolName, uploadLimit, uploadTags])

  const createLinkedCase = React.useCallback(async (analysis) => {
    setSavingCase(true)
    setSaveStatus('Creating new case…')
    try {
      const title = caseTitle.trim() || defaultCaseTitle
      const payload = buildCasePayload
        ? buildCasePayload(analysis, title)
        : { title, severity: 'INFO', status: 'OPEN', created_by: 'sap-rca-workspace' }

      const response = await createCase(payload)
      if (response?.ok === false) throw new Error(response?.detail || response?.raw || 'Failed to create case')

      let nextId = normalizeCaseId(response)
      if (!nextId) {
        const refreshedCases = await loadCases()
        const fallback = findFallbackCase(refreshedCases, payload.title || title)
        nextId = caseItemId(fallback)
      }

      if (!nextId) {
        throw new Error('Case was submitted, but no selectable case id was returned. Open Cases, refresh, then select the case manually.')
      }

      setCaseIdState(nextId)
      writeStoredCaseId(nextId)
      setCaseTitle('')
      setSaveStatus(`New case created and linked: ${nextId}`)
      loadCases()
      return nextId
    } catch (error) {
      setSaveStatus(error?.message || 'Failed to create case.')
      return ''
    } finally {
      setSavingCase(false)
    }
  }, [buildCasePayload, caseTitle, defaultCaseTitle, loadCases, writeStoredCaseId])

  return {
    recentCases,
    caseId,
    caseTitle,
    savingCase,
    saveStatus,
    setCaseId,
    setCaseTitle: setNewCaseTitle,
    clearCaseId,
    loadCases,
    persistAnalysis,
    createLinkedCase,
  }
}
