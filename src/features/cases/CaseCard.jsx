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

export default function CaseCard({ caseItem }) {
  const item = caseItem || {}
  const severity = item.severity || 'INFO'
  const status = item.status || 'OPEN'
  const title = item.title || item.case_no || 'Untitled RCA Case'
  const summary = item.summary || 'Belum ada management summary. Upload dan parse evidence untuk generate RCA summary.'
  const topProblem = item.top_suspect || item.top_anomaly || 'Pending analysis'

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

      <dl className="caseHistoryFacts">
        <div>
          <dt>SID</dt>
          <dd>{item.sid || '-'}</dd>
        </div>
        <div>
          <dt>Env</dt>
          <dd>{item.environment || '-'}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{status}</dd>
        </div>
        <div>
          <dt>Evidence</dt>
          <dd>{item.evidence_count ?? 0}</dd>
        </div>
      </dl>

      <div className="caseHistoryCardFoot">
        <span>Updated {formatDate(item.updated_at || item.created_at)}</span>
        <a href={`#/cases?case=${encodeURIComponent(item.id || item.case_no || '')}`} aria-label={`Open ${title}`}>
          Open
        </a>
      </div>
    </article>
  )
}
