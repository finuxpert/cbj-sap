import React from 'react'
import { archiveCase, deleteCase, listMobileCases } from '../../evidence-api-client.js'
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

function normalizeStageFilter(value) {
  if (!value || value === 'all') return ''
  return String(value).toUpperCase()
}

function caseStage(item) {
  return String(item?.case_stage || 'INTAKE').toUpperCase()
}

function countValue(primary, fallback = 0) {
  if (Array.isArray(primary)) return primary.length
  const number = Number(primary ?? fallback ?? 0)
  return Number.isFinite(number) ? number : 0
}

function caseTimestamp(item) {
  return Date.parse(item?.updated_at || item?.created_at || '') || 0
}

function caseIdentity(item) {
  return item?.id || item?.case_no || ''
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
  const [stage, setStage] = React.useState('all')
  const [tool, setTool] = React.useState('all')
  const [loading, setLoading] = React.useState(true)
  const [exporting, setExporting] = React.useState(false)
  const [archivingId, setArchivingId] = React.useState('')
  const [selectedIds, setSelectedIds] = React.useState(() => new Set())
  const [bulkMode, setBulkMode] = React.useState('')
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
    const expectedStage = normalizeStageFilter(stage)
    const expectedTool = tool === 'all' ? '' : tool

    return sortNewestFirst(cases.filter((item) => {
      const itemStatus = String(item.status || '').toUpperCase()
      const itemStage = caseStage(item)
      const itemTool = String(item.tool || '')
      if (expectedStatus && itemStatus !== expectedStatus) return false
      if (expectedStage && itemStage !== expectedStage) return false
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
        item.case_stage,
        item.tool,
        item.summary,
        item.top_anomaly,
        item.top_suspect,
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(q)
    }))
  }, [cases, query, status, stage, tool])

  React.useEffect(() => {
    const visibleIds = new Set(filteredCases.map(caseIdentity).filter(Boolean))
    setSelectedIds((current) => new Set([...current].filter((id) => visibleIds.has(id))))
  }, [filteredCases])

  const selectedCount = selectedIds.size
  const visibleIds = React.useMemo(() => filteredCases.map(caseIdentity).filter(Boolean), [filteredCases])
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))

  const setCaseSelected = React.useCallback((caseId, checked) => {
    if (!caseId) return
    setSelectedIds((current) => {
      const next = new Set(current)
      if (checked) next.add(caseId)
      else next.delete(caseId)
      return next
    })
  }, [])

  const toggleSelectVisible = React.useCallback(() => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id))
      } else {
        visibleIds.forEach((id) => next.add(id))
      }
      return next
    })
  }, [allVisibleSelected, visibleIds])

  const clearSelection = React.useCallback(() => setSelectedIds(new Set()), [])

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

  const bulkArchive = React.useCallback(async () => {
    const ids = [...selectedIds]
    if (!ids.length) return
    if (!window.confirm(`Archive ${ids.length} selected case(s)?`)) return
    setBulkMode('archive')
    setError('')
    try {
      for (const id of ids) {
        const payload = await archiveCase(id)
        if (payload?.ok === false) throw new Error(payload?.detail || payload?.raw || `Failed to archive ${id}`)
      }
      clearSelection()
      await loadCases()
    } catch (err) {
      setError(err?.message || 'Failed to bulk archive cases')
    } finally {
      setBulkMode('')
    }
  }, [clearSelection, loadCases, selectedIds])

  const bulkDelete = React.useCallback(async () => {
    const ids = [...selectedIds]
    if (!ids.length) return
    const typed = window.prompt(`DELETE ${ids.length} selected case(s)? This permanently removes case JSON only. Type DELETE to continue.`)
    if (typed !== 'DELETE') return
    setBulkMode('delete')
    setError('')
    try {
      for (const id of ids) {
        const payload = await deleteCase(id)
        if (payload?.ok === false) throw new Error(payload?.detail || payload?.raw || `Failed to delete ${id}`)
      }
      clearSelection()
      await loadCases()
    } catch (err) {
      setError(err?.message || 'Failed to bulk delete cases')
    } finally {
      setBulkMode('')
    }
  }, [clearSelection, loadCases, selectedIds])

  const exportPdf = React.useCallback(async () => {
    if (exporting) return
    setExporting(true)
    try {
      await exportCaseHistoryListPdf(filteredCases, { query, status, stage, tool })
    } catch (err) {
      console.error('[Case History PDF] failed:', err)
      window.print()
    } finally {
      setExporting(false)
    }
  }, [exporting, filteredCases, query, status, stage, tool])

  const activeCount = filteredCases.filter((item) => String(item?.status || '').toUpperCase() !== 'ARCHIVED').length
  const archivedCount = filteredCases.length - activeCount
  const classifiedCount = filteredCases.filter((item) => caseStage(item) === 'CLASSIFIED').length
  const evidenceTotal = filteredCases.reduce((sum, item) => sum + countValue(item.evidence, item.evidence_count), 0)
  const parsedTotal = filteredCases.reduce((sum, item) => sum + countValue(item.parsed_results, item.parsed_count ?? item.parsed_results_count), 0)

  return (
    <section className="caseHistoryPage container section">
      <div className="caseHistoryHero">
        <div>
          <p className="sectionKicker">Case History V1</p>
          <h1>Persistent SPHERE Investigation Workspace</h1>
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
            placeholder="Case id, title, stage, tool, anomaly, suspect…"
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
          <span>SPHERE Stage</span>
          <select value={stage} onChange={(event) => setStage(event.target.value)}>
            <option value="all">All stages</option>
            <option value="intake">INTAKE</option>
            <option value="waiting_evidence">WAITING_EVIDENCE</option>
            <option value="analyzing">ANALYZING</option>
            <option value="classified">CLASSIFIED</option>
            <option value="resolved">RESOLVED</option>
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
          <strong>{classifiedCount}</strong>
          <span>classified</span>
        </div>
        <div>
          <strong>{evidenceTotal}</strong>
          <span>evidence</span>
        </div>
        <div>
          <strong>{parsedTotal}</strong>
          <span>parsed</span>
        </div>
        <div>
          <strong>{archivedCount}</strong>
          <span>archived</span>
        </div>
      </div>

      <div className="caseMaintenanceBar card">
        <div>
          <strong>Case Maintenance</strong>
          <span>{selectedCount} selected from {filteredCases.length} visible case(s)</span>
        </div>
        <div className="caseMaintenanceActions">
          <button type="button" className="btn" onClick={toggleSelectVisible} disabled={!visibleIds.length || Boolean(bulkMode)}>
            {allVisibleSelected ? 'Unselect visible' : 'Select visible'}
          </button>
          <button type="button" className="btn" onClick={clearSelection} disabled={!selectedCount || Boolean(bulkMode)}>
            Clear
          </button>
          <button type="button" className="btn" onClick={bulkArchive} disabled={!selectedCount || Boolean(bulkMode)}>
            {bulkMode === 'archive' ? 'Archiving…' : 'Archive selected'}
          </button>
          <button type="button" className="btn danger" onClick={bulkDelete} disabled={!selectedCount || Boolean(bulkMode)}>
            {bulkMode === 'delete' ? 'Deleting…' : 'Delete selected'}
          </button>
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
                selected={selectedIds.has(caseIdentity(item))}
                onSelect={setCaseSelected}
              />
            )
          })}
        </div>
      )}
    </section>
  )
}
