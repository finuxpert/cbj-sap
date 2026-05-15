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

function messageTone(message = '') {
  const text = String(message || '').toLowerCase()
  if (!text) return 'info'
  if (text.includes('fail') || text.includes('error') || text.includes('blocked') || text.includes('not found') || text.includes('db write failed')) return 'error'
  if (text.includes('created') || text.includes('saved') || text.includes('ready') || text.includes('linked')) return 'success'
  return 'info'
}

function shouldUsePersistedStatus(message = '') {
  const text = String(message || '').toLowerCase()
  if (!text) return false
  return (
    text.includes('creating')
    || text.includes('saving')
    || text.includes('created')
    || text.includes('saved')
    || text.includes('failed')
    || text.includes('error')
    || text.includes('db write failed')
    || text.includes('not found')
    || text.includes('blocked')
  )
}

export default function CaseLinkPanel({
  title = 'Case History Link',
  description = 'Upload analyzes only. Create or select a case, then click Save to Case History.',
  caseId,
  caseTitle,
  recentCases = [],
  savingCase,
  creatingCase = false,
  saveStatus,
  onCaseIdChange,
  onCaseTitleChange,
  onCreateCase,
  onSaveCurrent,
  hasAnalysis,
  createLabel = 'Create Case',
  saveLabel = 'Save to Case History',
  titlePlaceholder = 'Contoh: SAP RCA investigation case',
}) {
  const [mode, setMode] = React.useState('create')
  const [selectedExistingCase, setSelectedExistingCase] = React.useState('')

  const visibleCases = recentCases.filter((item) => String(item?.status || '').toUpperCase() !== 'ARCHIVED')
  const linkedCase = findCase(recentCases, caseId)
  const linkedCaseDetails = linkedCase ? caseLabel(linkedCase) : caseId
  const hasTitle = Boolean(caseTitle.trim())

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

  const canCreate = mode === 'create' && hasTitle && !savingCase
  const canUseSelectedCase = mode === 'link' && Boolean(selectedExistingCase) && !savingCase
  const canSave = Boolean(caseId) && Boolean(hasAnalysis) && !savingCase && !hasTitle

  const handleCreateCase = React.useCallback(async () => {
    if (!canCreate) return
    await onCreateCase()
  }, [canCreate, onCreateCase])

  const handlePrimaryAction = React.useCallback(async () => {
    if (mode === 'create') {
      await handleCreateCase()
      return
    }
    if (!canUseSelectedCase) return
    onCaseIdChange(selectedExistingCase)
  }, [canUseSelectedCase, handleCreateCase, mode, onCaseIdChange, selectedExistingCase])

  const handleSave = React.useCallback(() => {
    if (!canSave) return
    onSaveCurrent({ explicitSaveIntent: true })
  }, [canSave, onSaveCurrent])

  let guidance = 'Enter a case title first.'
  if (creatingCase) {
    guidance = 'Creating case in PostgreSQL…'
  } else if (savingCase && caseId) {
    guidance = 'Saving parsed summary and evidence metadata…'
  } else if (mode === 'create' && !hasTitle && !caseId) {
    guidance = 'Enter a case title first.'
  } else if (mode === 'create' && hasTitle && !caseId && !hasAnalysis) {
    guidance = 'Click Create Case to link a new DB case now. Upload and analyze evidence before saving.'
  } else if (mode === 'create' && hasTitle && !caseId) {
    guidance = 'Click Create Case to link this analysis to a new DB case.'
  } else if (mode === 'link' && !visibleCases.length) {
    guidance = 'No existing DB case found. Create a new case first.'
  } else if (mode === 'link' && !selectedExistingCase && !caseId) {
    guidance = 'Choose an existing DB case first.'
  } else if (mode === 'link' && selectedExistingCase && !caseId) {
    guidance = 'Selected case is ready. Click Use Selected Case.'
  } else if (caseId && !hasAnalysis) {
    guidance = 'Case is linked. Upload and analyze evidence before saving.'
  } else if (caseId && canSave) {
    guidance = 'Selected case is ready. Click Save to Case History.'
  }

  const statusMessage = shouldUsePersistedStatus(saveStatus) ? saveStatus : guidance
  const statusTone = messageTone(statusMessage)
  const linkedBadgeText = caseId ? `Linked: ${caseId}` : 'Not linked yet'
  const linkedBadgeTone = caseId ? 'success' : 'neutral'
  const primaryLabel = mode === 'create' ? (creatingCase ? 'Creating…' : createLabel) : 'Use Selected Case'
  const primaryDisabled = mode === 'create' ? !canCreate : !canUseSelectedCase

  return (
    <section className="caseLinkCard">
      <div className="caseHistoryPanelHead">
        <div>
          <h2>{title}</h2>
          <p className="mutedText">{description}</p>
        </div>
      </div>

      <div className="caseLinkStep">
        <div className="caseLinkStepHead">
          <span className="caseLinkStepNumber">Step 1</span>
          <h3>Case Mode</h3>
        </div>
        <div className="caseHistoryModeSwitch" role="group" aria-label="Case link mode">
          <button type="button" className="btn" data-active={mode === 'create'} onClick={enterCreateMode}>Create New Case</button>
          <button type="button" className="btn" data-active={mode === 'link'} onClick={enterLinkMode}>Link Existing Case</button>
        </div>
      </div>

      <div className="caseLinkStep">
        <div className="caseLinkStepHead">
          <span className="caseLinkStepNumber">Step 2</span>
          <h3>Case Input</h3>
        </div>
        {mode === 'create' ? (
          <div className="caseLinkField">
            <label htmlFor="case-link-title">New Case Title</label>
            <input
              id="case-link-title"
              value={caseTitle}
              onFocus={enterCreateMode}
              onChange={(event) => handleTitleChange(event.target.value)}
              placeholder={titlePlaceholder}
            />
            <small>Create the case first, then save parsed summary and evidence.</small>
          </div>
        ) : (
          <div className="caseLinkField">
            <label htmlFor="case-link-select">Existing DB Case</label>
            <select id="case-link-select" value={selectedExistingCase} onChange={(event) => handleCaseSelect(event.target.value)}>
              <option value="">Choose case explicitly…</option>
              {visibleCases.map((item) => {
                const id = caseItemId(item)
                return <option key={id || item.title} value={id}>{caseLabel(item)}</option>
              })}
            </select>
            <small>{visibleCases.length ? 'Select the DB case that should receive this WP-SCOUT analysis.' : 'No existing DB case found. Create a new case first.'}</small>
          </div>
        )}
      </div>

      <div className="caseLinkStep">
        <div className="caseLinkStepHead">
          <span className="caseLinkStepNumber">Step 3</span>
          <h3>Linked Case</h3>
        </div>
        <div className="caseLinkStatusRow">
          <div className={`caseLinkBadge ${linkedBadgeTone}`}>{linkedBadgeText}</div>
          {caseId ? <div className="caseLinkLinkedValue">{linkedCaseDetails}</div> : null}
        </div>
      </div>

      <div className="caseLinkStep">
        <div className="caseLinkStepHead">
          <span className="caseLinkStepNumber">Step 4</span>
          <h3>Actions</h3>
        </div>
        <div className="caseLinkActions">
          <button className="btn" type="button" onClick={handlePrimaryAction} disabled={primaryDisabled}>
            {primaryLabel}
          </button>
          <button className="btn primary" type="button" onClick={handleSave} disabled={!canSave}>
            {savingCase && caseId ? 'Saving…' : saveLabel}
          </button>
        </div>
      </div>

      <div className="caseLinkStep">
        <div className="caseLinkStepHead">
          <span className="caseLinkStepNumber">Step 5</span>
          <h3>Status</h3>
        </div>
        <div className={`caseLinkStatusBox ${statusTone}`}>
          <div className="caseLinkGuidance">{statusMessage}</div>
        </div>
      </div>
    </section>
  )
}
