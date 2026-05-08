import React from 'react'
import { createCase, listMobileCases, saveParsedResult, uploadEvidence } from '../../evidence-api-client.js'
import { caseItemId, findFallbackCase, normalizeCaseId, normalizeCaseList } from './caseHistoryLinkUtils.js'

export default function useCaseHistoryLink({
  storageKey,
  buildCasePayload,
  buildParsedPayload,
  defaultCaseTitle = 'SAP RCA Case',
  toolName = 'SAP RCA Workspace',
  uploadLimit = 20,
  uploadTags = [],
  loadJson,
  saveJson,
}) {
  const readStoredCaseId = React.useCallback(() => {
    if (!storageKey) return ''
    if (loadJson) return loadJson(storageKey, '')
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '""') || ''
    } catch {
      return localStorage.getItem(storageKey) || ''
    }
  }, [loadJson, storageKey])

  const [recentCases, setRecentCases] = React.useState([])
  const [caseId, setCaseId] = React.useState(readStoredCaseId)
  const [caseTitle, setCaseTitle] = React.useState('')
  const [savingCase, setSavingCase] = React.useState(false)
  const [saveStatus, setSaveStatus] = React.useState('')

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

  React.useEffect(() => {
    if (!storageKey) return
    if (saveJson) {
      saveJson(storageKey, caseId || '')
      return
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(caseId || ''))
    } catch {
      // selected case is convenience cache only
    }
  }, [caseId, saveJson, storageKey])

  const persistAnalysis = React.useCallback(async (analysis, files = []) => {
    if (!caseId || !analysis || !buildParsedPayload) return
    setSavingCase(true)
    setSaveStatus('Saving parsed summary to Case History…')
    try {
      const saved = await saveParsedResult(caseId, buildParsedPayload(analysis))
      if (saved?.ok === false) throw new Error(saved?.detail || saved?.raw || 'Failed to save parsed result')

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
      setSaveStatus(error?.message || 'Failed to save parsed summary.')
    } finally {
      setSavingCase(false)
    }
  }, [buildParsedPayload, caseId, loadCases, toolName, uploadLimit, uploadTags])

  const createLinkedCase = React.useCallback(async (analysis) => {
    setSavingCase(true)
    setSaveStatus('Creating case…')
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

      setCaseId(nextId)
      setCaseTitle('')
      setSaveStatus(`Case linked: ${nextId}`)
      loadCases()
      return nextId
    } catch (error) {
      setSaveStatus(error?.message || 'Failed to create case.')
      return ''
    } finally {
      setSavingCase(false)
    }
  }, [buildCasePayload, caseTitle, defaultCaseTitle, loadCases])

  return {
    recentCases,
    caseId,
    caseTitle,
    savingCase,
    saveStatus,
    setCaseId,
    setCaseTitle,
    loadCases,
    persistAnalysis,
    createLinkedCase,
  }
}
