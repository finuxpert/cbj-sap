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
  if (text.includes('created') || text.includes('saved') || text.includes('selected') || text.includes('linked')) return 'success'
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
  const [selectedExistingCase, setSelectedExistingCase] = React.useState('')
  const linkedCase = findCase(recentCases, caseId)
  const visibleCases = recentCases.filter((item) => String(item?.status || '').toUpperCase() !== 'ARCHIVED')
  const canCreate = Boolean(hasAnalysis) && Boolean(caseTitle.trim()) && !savingCase
  const canUseSelectedCase = mode === 'link' && Boolean(selectedExistingCase) && !savingCase
  const canSave = Boolean(caseId) && Boolean(hasAnalysis) && !savingCase && !caseTitle.trim()
  const tone = statusTone(saveStatus)

  React.useEffect(() => {
    if (mode === 'link') setSelectedExistingCase(caseId || '')
  }, [caseId, mode])

  const enterCreateMode = React.useCallback(() => {
    setMode('create')
    setSelectedExistingCase('')
  }, [])

  const enterLinkMode = React.useCallback(() => {
    setMode('link')
    setSelectedExistingCase(caseId || '')
    if (caseTitle) onCaseTitleChange('')
  }, [caseId, caseTitle, onCaseTitleChange])

  const handleTitleChange = React.useCallback((nextTitle) => {
    setMode('create')
    if (caseId) onCaseIdChange('')
    setSelectedExistingCase('')
    onCaseTitleChange(nextTitle)
  }, [caseId, onCaseIdChange, onCaseTitleChange])

  const handleCaseSelect = React.useCallback((nextCaseId) => {
    setMode('link')
    setSelectedExistingCase(nextCaseId)
    if (caseTitle) onCaseTitleChange('')
  }, [caseTitle, onCaseTitleChange])

  const handlePrimaryAction = React.useCallback(async () => {
    if (mode === 'create') {
      if (!canCreate) return
      await onCreateCase()
      return
    }
    if (!canUseSelectedCase) return
    onCaseIdChange(selectedExistingCase)
  }, [canCreate, canUseSelectedCase, mode, onCaseIdChange, onCreateCase, selectedExistingCase])

  const handleSave = React.useCallback(() => {
    if (!canSave) return
    onSaveCurrent({ explicitSaveIntent: true })
  }, [canSave, onSaveCurrent])

  const linkedBadge = caseId
    ? { tone: 'success', text: `Linked: ${caseId}` }
    : { tone: 'neutral', text: 'Not linked yet' }

  let helperMessage = 'Ready: save parsed summary and linked evidence metadata to Case History.'
  if (!hasAnalysis) {
    helperMessage = 'Save disabled: upload and analyze evidence first.'
  } else if (mode === 'link' && !visibleCases.length) {
    helperMessage = 'No existing DB case found. Create a new case first.'
  } else if (mode === 'link' && !selectedExistingCase) {
    helperMessage = 'Select an existing DB case, then click Use Selected Case.'
  } else if (mode === 'create' && !caseTitle.trim()) {
    helperMessage = 'Create Case disabled: enter a new case title first.'
  } else if (!caseId) {
    helperMessage = 'Save disabled: create or link a case first.'
  } else if (caseTitle.trim()) {
    helperMessage = 'Save disabled: create the new case first.'
  }

  const primaryActionLabel = mode === 'create' ? createLabel : 'Use Selected Case'
  const primaryActionDisabled = mode === 'create' ? !canCreate : !canUseSelectedCase
  const linkedCaseText = caseId ? (linkedCase ? caseLabel(linkedCase) : caseId) : 'Not linked yet'

  return (
    <section className="evidencePanel caseHistoryLinkPanel">
      <div className="caseHistoryPanelHead">
        <div>
          <h2>{title}</h2>
          <p className="mutedText">{description}</p>
        </div>
      </div>

      <div className="caseHistorySection">
        <span className="caseHistorySectionLabel">Case Mode</span>
        <div className="caseHistoryModeSwitch" role="group" aria-label="Case link mode">
          <button type="button" className="btn" data-active={mode === 'create'} onClick={enterCreateMode}>Create New Case</button>
          <button type="button" className="btn" data-active={mode === 'link'} onClick={enterLinkMode}>Link Existing Case</button>
        </div>
      </div>

      <div className="caseHistorySection">
        <span className="caseHistorySectionLabel">Case Input</span>
        {mode === 'create' ? (
          <label className="caseHistoryField caseHistoryFieldProminent">
            <b>New Case Title</b>
            <input
              value={caseTitle}
              onFocus={enterCreateMode}
              onChange={(event) => handleTitleChange(event.target.value)}
              placeholder={titlePlaceholder}
            />
            <small>Create the case first, then save parsed summary and evidence to that linked case.</small>
          </label>
        ) : (
          <label className="caseHistoryField">
            <b>Link Existing Case</b>
            <select value={selectedExistingCase} onChange={(event) => handleCaseSelect(event.target.value)}>
              <option value="">Choose case explicitly…</option>
              {visibleCases.map((item) => {
                const id = caseItemId(item)
                return <option key={id || item.title} value={id}>{caseLabel(item)}</option>
              })}
            </select>
            <small>
              {visibleCases.length
                ? 'Choose the existing DB case that should receive this WP-SCOUT analysis.'
                : 'No existing DB case found. Create a new case first.'}
            </small>
          </label>
        )}
      </div>

      <div className="caseHistorySection">
        <span className="caseHistorySectionLabel">Linked Case</span>
        <div className="caseHistoryLinkedCard">
          <div className={`caseHistoryBadge ${linkedBadge.tone}`}>{linkedBadge.text}</div>
          <div className="caseHistoryLinkedValue">{linkedCaseText}</div>
        </div>
      </div>

      {children}

      <div className="caseHistorySection">
        <span className="caseHistorySectionLabel">Actions</span>
        <div className="caseHistoryActions">
          <button className="btn" type="button" onClick={handlePrimaryAction} disabled={primaryActionDisabled}>
            {savingCase && mode === 'create' ? 'Creating…' : savingCase && mode === 'link' ? 'Applying…' : primaryActionLabel}
          </button>
          <button className="btn primary" type="button" onClick={handleSave} disabled={!canSave}>
            {savingCase && caseId ? 'Saving…' : saveLabel}
          </button>
        </div>
      </div>

      <div className="caseHistorySection caseHistoryMessages">
        <span className="caseHistorySectionLabel">Guidance</span>
        <div className="caseHistoryHelperMessage">{helperMessage}</div>
        {saveStatus ? <div className={`caseHistoryStatusMessage ${tone}`}>{saveStatus}</div> : null}
      </div>
    </section>
  )
}
