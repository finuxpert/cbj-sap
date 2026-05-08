import React from 'react'
import { listMobileCases } from '../../evidence-api-client.js'
import CaseCard from '../../features/cases/CaseCard.jsx'
import { exportCaseHistoryListPdf } from '../../features/cases/casePdfExport.js'

function normalizeItems(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.cases)) return payload.cases
  return []
}

export default function CaseHistory() {
  const [cases, setCases] = React.useState([])
  const [query, setQuery] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [exporting, setExporting] = React.useState(false)
  const [error, setError] = React.useState('')

  const loadCases = React.useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const payload = await listMobileCases({ limit: 80 })
      if (payload?.ok === false) throw new Error(payload?.detail || payload?.raw || 'Failed to load case history')
      setCases(normalizeItems(payload))
    } catch (err) {
      setError(err?.message || 'Failed to load case history')
      setCases([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadCases()
  }, [loadCases])

  const filteredCases = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return cases.filter((item) => {
      const statusMatch = !status || String(item.status || '').toUpperCase() === status
      if (!statusMatch) return false
      if (!q) return true
      const haystack = [
        item.case_no,
        item.id,
        item.title,
        item.sid,
        item.environment,
        item.severity,
        item.status,
        item.summary,
        item.top_anomaly,
        item.top_suspect,
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [cases, query, status])

  const exportPdf = React.useCallback(async () => {
    if (exporting) return
    setExporting(true)
    try {
      await exportCaseHistoryListPdf(filteredCases, { query, status })
    } catch (err) {
      console.error('[Case History PDF] failed:', err)
      window.print()
    } finally {
      setExporting(false)
    }
  }, [exporting, filteredCases, query, status])

  return (
    <section className="caseHistoryPage container section">
      <div className="caseHistoryHero">
        <div>
          <p className="sectionKicker">Case History V1</p>
          <h1>Persistent RCA Investigation Workspace</h1>
          <p>
            Buka ulang investigation case dari mobile, cek anomaly summary, evidence count, status,
            dan management-ready RCA snapshot tanpa upload ulang.
          </p>
        </div>
        <div className="caseHistoryActions">
          <button className="btn" type="button" onClick={loadCases} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button className="btn primary" type="button" onClick={exportPdf} disabled={loading || exporting}>
            {exporting ? 'Preparing PDF…' : 'Export PDF'}
          </button>
        </div>
      </div>

      <div className="caseHistoryToolbar card">
        <label>
          <span>Search case</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Case no, SID, anomaly, suspect…"
          />
        </label>
        <label>
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All status</option>
            <option value="OPEN">OPEN</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="RESOLVED">RESOLVED</option>
            <option value="CLOSED">CLOSED</option>
          </select>
        </label>
      </div>

      {error && <div className="caseHistoryNotice isError">{error}</div>}

      {!error && loading && (
        <div className="caseHistoryNotice">Loading case history from /sap-api/mobile/cases…</div>
      )}

      {!loading && !error && filteredCases.length === 0 && (
        <div className="caseHistoryEmpty card">
          <strong>No case history found.</strong>
          <span>Case akan muncul setelah evidence di-link ke Case History API.</span>
        </div>
      )}

      {!loading && !error && filteredCases.length > 0 && (
        <div className="caseHistoryGrid">
          {filteredCases.map((item) => (
            <CaseCard key={item.id || item.case_no || item.title} caseItem={item} />
          ))}
        </div>
      )}
    </section>
  )
}
