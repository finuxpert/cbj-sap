import React from 'react'

function formatDate(value) {
  if (!value) return 'No timestamp'
  try {
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return String(value)
  }
}

function severityClass(value) {
  const normalized = String(value || 'INFO').toLowerCase()
  if (['crit', 'critical', 'high'].includes(normalized)) return 'isCritical'
  if (['warn', 'warning', 'medium'].includes(normalized)) return 'isWarning'
  return 'isInfo'
}

export default function CaseCard({ caseItem, onArchive, archiving = false }) {
  const item = caseItem || {}
  const severity = item.severity || 'INFO'
  const status = item.status || 'OPEN'
  const title = item.title || item.case_no || 'Untitled RCA Case'
  const caseId = item.id || item.case_no || ''
  const summary = item.summary || 'Belum ada management summary. Upload dan parse evidence untuk generate RCA summary.'
  const topProblem = item.top_suspect || item.top_anomaly || 'Pending analysis'
  const tool = item.tool || '-'
  const isArchived = String(status).toUpperCase() === 'ARCHIVED'
  const detailHref = `#/cases/${encodeURIComponent(caseId)}`

  return (
    <article className="caseHistoryCard">
      <div className="caseHistoryCardTop">
        <div className="caseHistoryMetaStack">
          <span className="caseHistoryCaseNo">{item.case_no || item.id || 'CASE-DRAFT'}</span>
          <h3>{title}</h3>
        </div>
        <span className={`caseHistorySeverity ${severityClass(severity)}`}>{severity}</span>
      </div>

      <p className="caseHistorySummary">{summary}</p>

      <div className="caseHistoryProblemBox">
        <span>Top problem</span>
        <strong>{topProblem}</strong>
      </div>

      <dl className="caseHistoryFacts caseHistoryFacts--expanded">
        <div>
          <dt>Status</dt>
          <dd>{status}</dd>
        </div>
        <div>
          <dt>Tool</dt>
          <dd>{tool}</dd>
        </div>
        <div>
          <dt>SID</dt>
          <dd>{item.sid || '-'}</dd>
        </div>
        <div>
          <dt>Evidence</dt>
          <dd>{item.evidence_count ?? 0}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{formatDate(item.updated_at || item.created_at)}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{formatDate(item.created_at)}</dd>
        </div>
      </dl>

      <div className="caseHistoryCardFoot caseHistoryCardFoot--actions">
        <span>{caseId}</span>
        <div className="caseHistoryCardActions">
          <a href={detailHref} aria-label={`Open ${title}`}>
            View
          </a>
          <a href={detailHref} aria-label={`Edit ${title}`}>
            Edit
          </a>
          <button
            className="caseHistoryActionBtn isDanger"
            type="button"
            onClick={() => onArchive?.(item)}
            disabled={archiving || isArchived}
          >
            {isArchived ? 'Archived' : (archiving ? 'Archiving…' : 'Archive')}
          </button>
        </div>
      </div>
    </article>
  )
}
