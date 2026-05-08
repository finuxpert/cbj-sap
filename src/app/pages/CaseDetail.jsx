import React from 'react'
import { getMobileCase } from '../../evidence-api-client.js'

function formatDate(value) {
  if (!value) return '-'
  try {
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return String(value)
  }
}

function normalizeCase(payload) {
  return payload?.case || payload?.item || payload || null
}

function Stat({ label, value }) {
  return (
    <div className="caseDetailStat">
      <span>{label}</span>
      <strong>{value || '-'}</strong>
    </div>
  )
}

function TimelineList({ items = [] }) {
  if (!items.length) {
    return <div className="caseDetailEmptyLine">No timeline saved yet.</div>
  }

  return (
    <div className="caseDetailTimeline">
      {items.map((item, index) => (
        <article key={item.id || `${item.time || item.created_at || 'timeline'}-${index}`}>
          <span>{formatDate(item.time || item.created_at)}</span>
          <strong>{item.title || item.tool || 'RCA event'}</strong>
          <p>{item.description || item.summary || item.reason || '-'}</p>
        </article>
      ))}
    </div>
  )
}

function ParsedResults({ items = [] }) {
  if (!items.length) {
    return <div className="caseDetailEmptyLine">No parsed result saved yet.</div>
  }

  return (
    <div className="caseDetailResultList">
      {items.map((item, index) => (
        <article key={item.id || `${item.tool || 'result'}-${index}`}>
          <div>
            <span>{item.tool || 'tool'}</span>
            <b>{item.severity || 'INFO'}</b>
          </div>
          <strong>{item.top_anomaly || item.verdict || 'Parsed result'}</strong>
          <p>{item.summary || item.top_suspect || '-'}</p>
        </article>
      ))}
    </div>
  )
}

function EvidenceList({ items = [] }) {
  if (!items.length) {
    return <div className="caseDetailEmptyLine">No linked evidence yet.</div>
  }

  return (
    <div className="caseDetailEvidenceList">
      {items.map((item, index) => (
        <a
          key={item.id || `${item.title || item.original_filename || 'evidence'}-${index}`}
          href={item.download_url || '#'}
          target="_blank"
          rel="noreferrer"
        >
          <strong>{item.title || item.original_filename || item.id || 'Evidence file'}</strong>
          <span>{item.tool || 'evidence'} · {formatDate(item.created_at)}</span>
        </a>
      ))}
    </div>
  )
}

export default function CaseDetail({ caseId }) {
  const [caseData, setCaseData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  const loadCase = React.useCallback(async () => {
    if (!caseId) return
    setLoading(true)
    setError('')
    try {
      const payload = await getMobileCase(caseId)
      if (payload?.ok === false) throw new Error(payload?.detail || payload?.raw || 'Failed to load case detail')
      setCaseData(normalizeCase(payload))
    } catch (err) {
      setError(err?.message || 'Failed to load case detail')
      setCaseData(null)
    } finally {
      setLoading(false)
    }
  }, [caseId])

  React.useEffect(() => {
    loadCase()
  }, [loadCase])

  const topProblem = caseData?.top_problem || {}
  const summary = caseData?.executive_summary || caseData?.summary || 'No management summary saved yet.'

  return (
    <section className="caseDetailPage container section">
      <div className="caseDetailBackRow">
        <a href="#/cases">← Back to Case History</a>
        <button className="btn" type="button" onClick={loadCase} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <div className="caseHistoryNotice isError">{error}</div>}
      {!error && loading && <div className="caseHistoryNotice">Loading case detail from /sap-api/mobile/cases/{caseId}…</div>}

      {!loading && !error && caseData && (
        <>
          <div className="caseDetailHero">
            <div>
              <p className="sectionKicker">Management RCA Snapshot</p>
              <h1>{caseData.title || caseData.case_no || caseData.id}</h1>
              <p>{summary}</p>
            </div>
            <div className="caseDetailBadgeStack">
              <span>{caseData.severity || 'INFO'}</span>
              <strong>{caseData.status || 'OPEN'}</strong>
            </div>
          </div>

          <div className="caseDetailStats">
            <Stat label="Case No" value={caseData.case_no || caseData.id} />
            <Stat label="SID" value={caseData.sid} />
            <Stat label="Environment" value={caseData.environment} />
            <Stat label="Updated" value={formatDate(caseData.updated_at || caseData.created_at)} />
          </div>

          <div className="caseDetailMainGrid">
            <article className="caseDetailPanel caseDetailPanel--primary">
              <p className="sectionKicker">Top Problem</p>
              <h2>{topProblem.label || caseData.top_suspect || caseData.top_anomaly || 'Pending analysis'}</h2>
              <p>{topProblem.reason || caseData.top_anomaly || 'Upload and parse evidence to generate anomaly detail.'}</p>
            </article>

            <article className="caseDetailPanel">
              <p className="sectionKicker">Evidence / Report</p>
              <div className="caseDetailMiniCounts">
                <div><strong>{caseData.evidence?.length || caseData.evidence_count || 0}</strong><span>Evidence</span></div>
                <div><strong>{caseData.reports?.length || caseData.report_count || 0}</strong><span>Reports</span></div>
                <div><strong>{caseData.parsed_results?.length || 0}</strong><span>Parsed</span></div>
              </div>
            </article>
          </div>

          <div className="caseDetailSections">
            <article className="caseDetailPanel">
              <div className="caseDetailSectionHead">
                <p className="sectionKicker">Timeline</p>
                <span>Latest 20</span>
              </div>
              <TimelineList items={caseData.timeline || []} />
            </article>

            <article className="caseDetailPanel">
              <div className="caseDetailSectionHead">
                <p className="sectionKicker">Parsed Results</p>
                <span>Latest 10</span>
              </div>
              <ParsedResults items={caseData.parsed_results || []} />
            </article>

            <article className="caseDetailPanel">
              <div className="caseDetailSectionHead">
                <p className="sectionKicker">Linked Evidence</p>
                <span>{caseData.evidence?.length || 0} files</span>
              </div>
              <EvidenceList items={caseData.evidence || []} />
            </article>
          </div>
        </>
      )}
    </section>
  )
}
