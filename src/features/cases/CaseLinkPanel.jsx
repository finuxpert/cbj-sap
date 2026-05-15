import React from 'react'
import { caseItemId } from './caseHistoryLinkUtils.js'

export default function CaseLinkPanel({
  title = 'Case History Link',
  description = 'Pilih atau buat case supaya hasil parsing tersimpan dan bisa dibuka ulang dari #/cases maupun mobile.',
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
}) {
  const [mode, setMode] = React.useState('new')
  const linkedCaseId = mode === 'existing' ? (caseId || '') : ''
  const canSave = mode === 'existing' && Boolean(caseId) && Boolean(hasAnalysis) && !savingCase
  const canCreate = mode === 'new' && !savingCase

  const selectableCases = recentCases.filter((item) => {
    const id = caseItemId(item)
    const status = String(item?.status || '').toUpperCase()
    return status !== 'ARCHIVED' || id === linkedCaseId
  })

  const switchToNew = React.useCallback(() => {
    setMode('new')
    if (caseId) onCaseIdChange('')
  }, [caseId, onCaseIdChange])

  const switchToExisting = React.useCallback(() => {
    setMode('existing')
    if (caseTitle) onCaseTitleChange('')
  }, [caseTitle, onCaseTitleChange])

  const handleNewTitleChange = React.useCallback((nextTitle) => {
    setMode('new')
    if (caseId) onCaseIdChange('')
    onCaseTitleChange(nextTitle)
  }, [caseId, onCaseIdChange, onCaseTitleChange])

  const handleExistingCaseChange = React.useCallback((nextCaseId) => {
    setMode('existing')
    onCaseIdChange(nextCaseId)
    if (caseTitle) onCaseTitleChange('')
  }, [caseTitle, onCaseIdChange, onCaseTitleChange])

  const handleCreateCase = React.useCallback(() => {
    setMode('existing')
    onCreateCase()
  }, [onCreateCase])

  const handleSaveCurrent = React.useCallback(() => {
    if (!canSave) return
    onSaveCurrent()
  }, [canSave, onSaveCurrent])

  return (
    <section className="evidencePanel caseHistoryLinkPanel">
      <h2>{title}</h2>
      <p className="mutedText">{description}</p>

      <div className="caseHistoryModeSwitch" role="group" aria-label="Case link mode">
        <button type="button" className="btn" data-active={mode === 'new'} onClick={switchToNew}>Create New Case</button>
        <button type="button" className="btn" data-active={mode === 'existing'} onClick={switchToExisting}>Use Existing Case</button>
      </div>

      {mode === 'new' ? (
        <div className="evidenceList compact">
          <label>
            <b>New Case Title</b>
            <input
              value={caseTitle}
              onFocus={switchToNew}
              onChange={(event) => handleNewTitleChange(event.target.value)}
              placeholder={titlePlaceholder}
            />
            <small>Create mode is isolated from existing cases. Save is disabled until the new case is created and linked.</small>
          </label>
        </div>
      ) : (
        <div className="evidenceList compact">
          <label>
            <b>Existing Case</b>
            <select value={linkedCaseId} onChange={(event) => handleExistingCaseChange(event.target.value)}>
              <option value="">Not linked</option>
              {selectableCases.map((item) => {
                const id = caseItemId(item)
                const status = String(item?.status || '').toUpperCase()
                const suffix = status === 'ARCHIVED' ? ' [ARCHIVED]' : ''
                return <option key={id || item.title} value={id}>{(item.case_no || id)} · {item.title || 'Untitled'}{suffix}</option>
              })}
            </select>
            <small>Select an existing case only when you want to append this parsed evidence to that case.</small>
          </label>
        </div>
      )}

      <div className="caseHistoryActions">
        <button className="btn" type="button" onClick={handleCreateCase} disabled={!canCreate}>
          {savingCase && mode === 'new' ? 'Creating…' : createLabel}
        </button>
        <button className="btn primary" type="button" onClick={handleSaveCurrent} disabled={!canSave}>
          {savingCase && mode === 'existing' ? 'Saving…' : saveLabel}
        </button>
      </div>

      {mode === 'new' ? <small>Flow: enter title → Create Case → Use Existing Case mode auto-links the new case → Save.</small> : null}
      {saveStatus && <small>{saveStatus}</small>}
    </section>
  )
}
