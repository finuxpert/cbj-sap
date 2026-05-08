import React from 'react'
import { archiveCase, listMobileCases } from '../../evidence-api-client.js'
import CaseCard from '../../features/cases/CaseCard.jsx'
import { exportCaseHistoryListPdf } from '../../features/cases/casePdfExport.js'

function normalizeItems(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.cases)) return payload.cases
  return []
}

function normalizeStatusFilter(value) {
  if (!value || value === 'all') return ''
  return String(value).toUpperCase()
}

function caseTimestamp(item) {
  return Date.parse(item?.updated_at || item?.created_at || '') || 0
}

function sortNewestFirst(items = []) {
  return [...items].sort((left, right) => caseTimestamp(right) - caseTimestamp(left))
}

function deriveToolOptions(items = []) {
  return [...new Set(items.map((item) => String(item?.tool || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

export default function CaseHistory() {
  const [cases, setCases] = React.useState([])
  const [query, setQuery] = React.useState('')
  const [status, setStatus] = React.useState('all')
  const [tool, setTool] = React.useState('all')
  const [loading, setLoading] = React.useState(true)
  const [exporting, setExporting] = React.useState(false)
  const [archivingId, setArchivingId] = React.useState('')
  const [error, setError] = React.useState('')

  const loadCases = React.useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const payload = await listMobileCases({ limit: 120 })
      if (payload?.ok === false) throw new Error(payload?.detail || payload?.raw || 'Failed to load case history')
      setCases(sortNewestFirst(normalizeItems(payload)))
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

  const toolOptions = React.useMemo(() => deriveToolOptions(cases), [cases])

  const filteredCases = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    const expectedStatus = normalizeStatusFilter(status)
    const expectedTool = tool === 'all' ? '' : tool

    return sortNewestFirst(cases.filter((item) => {
      const itemStatus = String(item.status || '').toUpperCase()
      const itemTool = String(item.tool || '')
      if (expectedStatus && itemStatus !== expectedStatus) return false
      if (expectedTool && itemTool !== expectedTool) return false
      if (!q) return true
      const haystack = [
        item.case_no,
        item.id,
        item.title,
        item.sid,
        item.environment,
        item.severity,
        item.status,
        item.tool,
        item.summary,
        item.top_anomaly,
        item.top_suspect,
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(q)
    }))
  }, [cases, query, status, tool])

  const archiveSelectedCase = React.useCallback(async (item) => {
    const nextId = item?.id || item?.case_no || ''
    if (!nextId) return
    const title = item?.title || item?.case_no || nextId
    if (!window.confirm(`Archive case ${title}?`)) return

    setArchivingId(nextId)
    setError('')
    try {
      const payload = await archiveCase(nextId)
      if (payload?.ok === false) throw new Error(payload?.detail || payload?.raw || 'Failed to archive case')
      await loadCases()
    } catch (err) {
      setError(err?.message || 'Failed to archive case')
    } finally {
      setArchivingId('')
    }
  }, [loadCases])

  const exportPdf = React.useCallback(async () => {
    if (exporting) return
    setExporting(true)
    try {
      await exportCaseHistoryListPdf(filteredCases, { query, status, tool })
    } catch (err) {
      console.error('[Case History PDF] failed:', err)
      window.print()
    } finally {
      setExporting(false)
    }
  }, [exporting, filteredCases, query, status, tool])

  const activeCount = filteredCases.filter((item) => String(item?.status || '').toUpperCase() !== 'ARCHIVED').length
  const archivedCount = filteredCases.length - activeCount

  return (
    <section className="caseHistoryPage container section">
      <div className="caseHistoryHero">
        <div>
          <p className="sectionKicker">Case History V1</p>
          <h1>Persistent RCA Investigation Workspace</h1>
          <p>
            Buka ulang investigation case dari mobile, cek anomaly summary, linked evidence,
            parsed result, dan maintenance status tanpa upload ulang.
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
            placeholder="Case id, title, tool, anomaly, suspect…"
          />
        </label>
        <label>
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All status</option>
            <option value="open">OPEN</option>
            <option value="in_progress">IN_PROGRESS</option>
            <option value="closed">CLOSED</option>
            <option value="archived">ARCHIVED</option>
          </select>
        </label>
        <label>
          <span>Tool</span>
          <select value={tool} onChange={(event) => setTool(event.target.value)}>
            <option value="all">All tools</option>
            {toolOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>

      <div className="caseHistorySummaryBar card">
        <div>
          <strong>{filteredCases.length}</strong>
          <span>visible cases</span>
        </div>
        <div>
          <strong>{activeCount}</strong>
          <span>active</span>
        </div>
        <div>
          <strong>{archivedCount}</strong>
          <span>archived</span>
        </div>
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
          {filteredCases.map((item) => {
            const itemId = item.id || item.case_no || item.title
            return (
              <CaseCard
                key={itemId}
                caseItem={item}
                onArchive={archiveSelectedCase}
                archiving={archivingId === (item.id || item.case_no)}
              />
            )
          })}
        </div>
      )}
    </section>
  )
}
