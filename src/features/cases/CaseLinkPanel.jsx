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
  const selectableCases = recentCases.filter((item) => {
    const id = caseItemId(item)
    const status = String(item?.status || '').toUpperCase()
    return status !== 'ARCHIVED' || id === caseId
  })

  return (
    <section className="evidencePanel caseHistoryLinkPanel">
      <h2>{title}</h2>
      <p className="mutedText">{description}</p>
      <div className="evidenceList compact">
        <label>
          <b>Existing Case</b>
          <select value={caseId} onChange={(event) => onCaseIdChange(event.target.value)}>
            <option value="">Not linked</option>
            {selectableCases.map((item) => {
              const id = caseItemId(item)
              const status = String(item?.status || '').toUpperCase()
              const suffix = status === 'ARCHIVED' ? ' [ARCHIVED]' : ''
              return <option key={id || item.title} value={id}>{(item.case_no || id)} · {item.title || 'Untitled'}{suffix}</option>
            })}
          </select>
        </label>
        <label>
          <b>New Case Title</b>
          <input
            value={caseTitle}
            onChange={(event) => onCaseTitleChange(event.target.value)}
            placeholder={titlePlaceholder}
          />
        </label>
      </div>
      <div className="caseHistoryActions">
        <button className="btn" type="button" onClick={onCreateCase} disabled={savingCase}>
          {savingCase ? 'Creating…' : createLabel}
        </button>
        <button className="btn primary" type="button" onClick={onSaveCurrent} disabled={savingCase || !caseId || !hasAnalysis}>
          {savingCase ? 'Saving…' : saveLabel}
        </button>
      </div>
      {saveStatus && <small>{saveStatus}</small>}
    </section>
  )
}
