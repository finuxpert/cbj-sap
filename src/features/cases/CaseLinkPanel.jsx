import React from 'react'
import { caseItemId } from './caseHistoryLinkUtils.js'

function caseLabel(item = {}) {
  const id = caseItemId(item)
  const stage = String(item.case_stage || 'INTAKE').toUpperCase()
  const severity = String(item.severity || 'INFO').toUpperCase()
  const sid = item.sid ? ` · ${item.sid}` : ''
  const env = item.environment ? `/${item.environment}` : ''
  const status = item.status ? ` · ${String(item.status).toUpperCase()}` : ''
  return `${item.case_no || id}${sid}${env} · ${stage} · ${severity}${status}`
}

function findCase(items = [], id = '') {
  return items.find((item) => caseItemId(item) === id) || null
}

function statusTone(message = '') {
  const text = String(message || '').toLowerCase()
  if (!text) return ''
  if (text.includes('fail') || text.includes('error') || text.includes('blocked') || text.includes('not found')) return 'error'
  if (text.includes('created') || text.includes('saved') || text.includes('selected')) return 'success'
  return 'info'
}

export default function CaseLinkPanel({
  title = 'Case History Link',
  description = 'Upload analyzes only. Create or select a case, then click Save to Case History.',
  caseId,
  caseTitle,
  recentCases = [],
  savingCase,
  saveStatus,
  onCaseIdChange,
  onCaseTitleChange,
  onCreateCase,
  onSaveCurrent,
  hasAnalysis,
  createLabel = 'Create Case',
  saveLabel = 'Save to Case History',
  titlePlaceholder = 'Contoh: SAP RCA investigation case',
  children,
}) {
  const [mode, setMode] = React.useState('create')
  const linkedCase = findCase(recentCases, caseId)
  const linkedCaseText = caseId ? (linkedCase ? caseLabel(linkedCase) : caseId) : 'Not linked yet'
  const visibleCases = recentCases.filter((item) => String(item?.status || '').toUpperCase() !== 'ARCHIVED')
  const canCreate = mode === 'create' && !savingCase && Boolean(hasAnalysis) && Boolean(caseTitle.trim())
  const canSave = Boolean(caseId) && Boolean(hasAnalysis) && !savingCase && !caseTitle.trim()
  const tone = statusTone(saveStatus)

  const resetLink = React.useCallback(() => {
    if (caseId) onCaseIdChange('')
  }, [caseId, onCaseIdChange])

  const enterCreateMode = React.useCallback(() => {
    setMode('create')
    resetLink()
  }, [resetLink])

  const enterLinkMode = React.useCallback(() => {
    setMode('link')
    if (caseTitle) onCaseTitleChange('')
  }, [caseTitle, onCaseTitleChange])

  const handleTitleChange = React.useCallback((nextTitle) => {
    setMode('create')
    resetLink()
    onCaseTitleChange(nextTitle)
  }, [onCaseTitleChange, resetLink])

  const handleCaseSelect = React.useCallback((nextCaseId) => {
    setMode('link')
    onCaseIdChange(nextCaseId)
    if (caseTitle) onCaseTitleChange('')
  }, [caseTitle, onCaseIdChange, onCaseTitleChange])

  const handleCreateCase = React.useCallback(async () => {
    if (!canCreate) return
    await onCreateCase()
  }, [canCreate, onCreateCase])

  const handleSave = React.useCallback(() => {
    if (!canSave) return
    onSaveCurrent({ explicitSaveIntent: true })
  }, [canSave, onSaveCurrent])

  return (
    <section className="evidencePanel caseHistoryLinkPanel">
      <h2>{title}</h2>
      <p className="mutedText">{description}</p>

      <div className="caseHistoryModeSwitch" role="group" aria-label="Case link mode">
        <button type="button" className="btn" data-active={mode === 'create'} onClick={enterCreateMode}>Create New Case</button>
        <button type="button" className="btn" data-active={mode === 'link'} onClick={enterLinkMode}>Link Existing Case</button>
      </div>

      <div className="evidenceList compact">
        {mode === 'create' ? (
          <label>
            <b>New Case Title</b>
            <input
              value={caseTitle}
              onFocus={enterCreateMode}
              onChange={(event) => handleTitleChange(event.target.value)}
              placeholder={titlePlaceholder}
            />
            <small>Create a new incident case after analysis is ready. Save is enabled only after a case is linked.</small>
          </label>
        ) : (
          <label>
            <b>Link Existing Case</b>
            <select value={caseId || ''} onChange={(event) => handleCaseSelect(event.target.value)}>
              <option value="">Choose case explicitly…</option>
              {visibleCases.map((item) => {
                const id = caseItemId(item)
                return <option key={id || item.title} value={id}>{caseLabel(item)}</option>
              })}
            </select>
            <small>Use this only when this evidence belongs to the same incident/RCA case.</small>
          </label>
        )}

        {children}

        <div>
          <b>Linked Case</b>
          <span>{linkedCaseText}</span>
        </div>
      </div>

      <div className="caseHistoryActions">
        <button className="btn" type="button" onClick={handleCreateCase} disabled={!canCreate}>
          {savingCase && mode === 'create' ? 'Creating…' : createLabel}
        </button>
        <button className="btn primary" type="button" onClick={handleSave} disabled={!canSave}>
          {savingCase && caseId ? 'Saving…' : saveLabel}
        </button>
      </div>

      <small>
        {mode === 'create'
          ? 'Flow: Upload & Analyze → New Case Title → Create Case → Save to Case History.'
          : 'Flow: choose case explicitly → Save to Case History.'}
      </small>
      {saveStatus && <small data-tone={tone}>{saveStatus}</small>}
    </section>
  )
}
