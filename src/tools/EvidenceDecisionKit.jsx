import React from 'react'
import { copyText, downloadJson, fileSizeLabel } from './evidence-utils.js'
import './EvidenceDecisionKit.css'

export function DecisionCard({ label, value, hint, tone = '' }) {
  return <div className={`decisionCard ${tone}`}><span>{label}</span><b>{value}</b><small>{hint}</small></div>
}

export function SessionBanner({ session }) {
  if (!session) return null
  const windowLabel = [session.window?.start, session.window?.end].filter(Boolean).join('–')
  return (
    <details className="sessionContext">
      <summary>
        <span className="sessionContextLabel">Session context</span>
        <strong>{session.sid || 'SAP'}</strong>
        <span>{session.host || 'Host n/a'}</span>
        {windowLabel ? <span>{windowLabel}</span> : null}
        <em>Details</em>
      </summary>
      <div className="sessionContextBody">
        <b>Latest correlated RCA session</b>
        <p>{session.summary || 'No additional session summary available.'}</p>
      </div>
    </details>
  )
}

export function EvidenceToolbar({ analysis, cacheKey, reportText, filenamePrefix = 'sap-evidence-analysis' }) {
  const [copied, setCopied] = React.useState(false)
  const canExport = Boolean(analysis)

  const copy = async () => {
    await copyText(reportText || JSON.stringify(analysis || {}, null, 2))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const clear = () => {
    const confirmed = window.confirm('Clear local cached analysis for this tool? Server evidence and Case History are not deleted.')
    if (!confirmed) return
    if (cacheKey) localStorage.removeItem(cacheKey)
    window.location.reload()
  }

  return (
    <div className="evidenceToolbar" aria-label="Analysis actions">
      <button className="evidenceToolbarPrimary" type="button" disabled={!canExport} onClick={copy}>
        {copied ? 'Copied' : 'Copy summary'}
      </button>
      <details className="evidenceActionMenu">
        <summary>More</summary>
        <div className="evidenceActionMenuPanel">
          <button type="button" disabled={!canExport} onClick={() => downloadJson(`${filenamePrefix}.json`, analysis)}>Export JSON</button>
          <button className="danger" type="button" onClick={clear}>Clear local cache</button>
        </div>
      </details>
    </div>
  )
}

export function WorkspaceTabs({ tabs = [], active, onChange, label = 'Analysis views' }) {
  return (
    <nav className="workspaceTabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          type="button"
          role="tab"
          key={tab.id}
          aria-selected={active === tab.id}
          data-active={active === tab.id ? 'true' : 'false'}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.meta ? <span>{tab.meta}</span> : null}
        </button>
      ))}
    </nav>
  )
}

export function AnalysisDisclosure({ label, title, meta, children, defaultOpen = false }) {
  return (
    <details className="analysisDisclosure" open={defaultOpen || undefined}>
      <summary>
        <span>{label}</span>
        <strong>{title}</strong>
        {meta ? <small>{meta}</small> : null}
        <em>Open</em>
      </summary>
      <div className="analysisDisclosureBody">{children}</div>
    </details>
  )
}

export function UploadedFilesPanel({ files = [] }) {
  return <section className="evidencePanel"><h2>Uploaded Files</h2>{files.length ? <div className="evidenceList compact">{files.slice(0, 18).map((file) => <div key={`${file.name}-${file.size}`}><b>{file.name}</b><span>{fileSizeLabel(file.size)}</span></div>)}</div> : <p>No upload in this page yet. Cached analysis may still be shown.</p>}</section>
}

export function EmptyState({ title = 'How to use this analyzer', children }) {
  return <section className="evidencePanel emptyState"><h2>{title}</h2>{children}</section>
}

export function EvidenceServerPanel({ serverInfo }) {
  const count = Array.isArray(serverInfo?.items) ? serverInfo.items.length : Array.isArray(serverInfo?.evidence) ? serverInfo.evidence.length : 0
  return <section className="evidencePanel"><h2>Evidence Server Context</h2><p>{serverInfo?.ok === false ? 'Evidence API list is not available from this page.' : 'Recent server evidence context loaded for reference.'}</p><div className="confidenceRows"><span>Recent Items<b>{count}</b></span><span>Source<b>/sap-api/evidence</b></span><span>Status<b>{serverInfo?.ok === false ? 'Partial' : 'Ready'}</b></span></div></section>
}
