import { useEffect, useMemo, useState } from 'react'
import { listParsedResultsHistory } from '../../evidence-api-client.js'

function fmtDate(value) {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleString('id-ID', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(value)
  }
}

function normalizeParsedResultsResponse(payload) {
  if (Array.isArray(payload)) {
    return {
      ok: true,
      readSource: 'legacy_array',
      mode: 'unknown',
      count: payload.length,
      parsedResults: payload,
      fallbackReason: null,
    }
  }

  const parsedResults = Array.isArray(payload?.parsed_results)
    ? payload.parsed_results
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.items)
        ? payload.items
        : []

  return {
    ok: Boolean(payload?.ok ?? true),
    readSource: payload?.read_source || payload?.readSource || 'unknown',
    mode: payload?.mode || 'unknown',
    count: Number(payload?.count ?? parsedResults.length),
    parsedResults,
    fallbackReason: payload?.fallback_reason || payload?.fallbackReason || null,
  }
}

function severityClass(value) {
  const v = String(value || 'INFO').toUpperCase()
  if (v === 'CRIT' || v === 'ERROR') return 'danger'
  if (v === 'WARN' || v === 'WARNING') return 'warning'
  return 'success'
}

function severityValue(value) {
  return String(value || 'INFO').trim().toUpperCase()
}

function toolValue(value) {
  return String(value || 'Unknown tool').trim() || 'Unknown tool'
}

function uniqueValues(rows, getter) {
  return [...new Set(rows.map(getter).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

function searchableText(item) {
  return [
    item?.case_id,
    item?.tool,
    item?.severity,
    item?.summary,
    item?.top_anomaly,
    item?.top_suspect,
    item?.verdict,
    item?.id,
  ].filter(Boolean).join(' ').toLowerCase()
}

export default function ParsedResultsHistoryMiniPanel() {
  const [state, setState] = useState({
    loading: true,
    error: '',
    payload: null,
  })
  const [toolFilter, setToolFilter] = useState('all')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [caseSearch, setCaseSearch] = useState('')
  const [copiedKey, setCopiedKey] = useState('')

  async function loadParsedResultsHistory() {
    setState((prev) => ({ ...prev, loading: true, error: '' }))

    try {
      const payload = await listParsedResultsHistory({ limit: 25 })
      setState({
        loading: false,
        error: '',
        payload: normalizeParsedResultsResponse(payload),
      })
    } catch (error) {
      setState({
        loading: false,
        error: error?.message || 'Failed to load parsed results history',
        payload: null,
      })
    }
  }

  useEffect(() => {
    loadParsedResultsHistory()
  }, [])

  const allRows = useMemo(() => state.payload?.parsedResults || [], [state.payload])
  const toolOptions = useMemo(() => uniqueValues(allRows, (item) => toolValue(item?.tool)), [allRows])
  const severityOptions = useMemo(() => uniqueValues(allRows, (item) => severityValue(item?.severity)), [allRows])

  const filteredRows = useMemo(() => {
    const expectedTool = toolFilter === 'all' ? '' : toolFilter
    const expectedSeverity = severityFilter === 'all' ? '' : severityFilter
    const query = caseSearch.trim().toLowerCase()

    return allRows.filter((item) => {
      if (expectedTool && toolValue(item?.tool) !== expectedTool) return false
      if (expectedSeverity && severityValue(item?.severity) !== expectedSeverity) return false
      return !query || searchableText(item).includes(query)
    })
  }, [allRows, caseSearch, severityFilter, toolFilter])

  const rows = useMemo(() => filteredRows.slice(0, 8), [filteredRows])

  function resetFilters() {
    setToolFilter('all')
    setSeverityFilter('all')
    setCaseSearch('')
  }

  async function copyValue(value, key) {
    if (!value || !navigator?.clipboard?.writeText) return
    await navigator.clipboard.writeText(value)
    setCopiedKey(key)
    window.setTimeout(() => setCopiedKey(''), 1400)
  }

  return (
    <section className="resultPanel evidenceHistoryDbPanel parsedResultsHistoryDbPanel">
      <div className="panelTitleRow">
        <div>
          <h3>Parsed Results History</h3>
          <p>
            PostgreSQL-backed RCA parser result timeline across saved investigations.
          </p>
        </div>
        <button
          type="button"
          className="investSecondary"
          onClick={loadParsedResultsHistory}
          disabled={state.loading}
        >
          {state.loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {state.error && (
        <div className="investStatus danger">
          {state.error}
        </div>
      )}

      {!state.error && (
        <div className="evidenceHistoryMeta">
          <span>Source: <b>{state.payload?.readSource || '-'}</b></span>
          <span>Mode: <b>{state.payload?.mode || '-'}</b></span>
          <span>Total: <b>{state.payload?.count ?? '-'}</b></span>
          <span>Visible: <b>{filteredRows.length}</b></span>
          {state.payload?.fallbackReason && (
            <span>Fallback: <b>{state.payload.fallbackReason}</b></span>
          )}
        </div>
      )}

      <div className="parsedResultsHistoryFilters">
        <label>
          <span>Tool</span>
          <select value={toolFilter} onChange={(event) => setToolFilter(event.target.value)}>
            <option value="all">All tools</option>
            {toolOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Severity</span>
          <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>
            <option value="all">All severity</option>
            {severityOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Case / keyword</span>
          <input
            value={caseSearch}
            onChange={(event) => setCaseSearch(event.target.value)}
            placeholder="case_id, summary, suspect…"
          />
        </label>
        <button type="button" className="investSecondary" onClick={resetFilters}>
          Reset
        </button>
      </div>

      <div className="miniTable evidenceHistoryRows parsedResultsHistoryRows">
        {rows.length === 0 && (
          <div>
            <b>{state.loading ? 'Loading parsed results…' : 'No parsed results found'}</b>
            <span>{allRows.length ? 'Adjust filters to show more rows.' : 'Run and save RCA parser results to populate this panel.'}</span>
          </div>
        )}

        {rows.map((item) => {
          const caseId = item.case_id || ''
          const suspect = item.top_suspect || ''
          const rowId = item.id || `${item.case_id}-${item.created_at}-${item.tool}`
          const copiedCase = copiedKey === `${rowId}:case`
          const copiedSuspect = copiedKey === `${rowId}:suspect`
          return (
            <div key={rowId}>
              <b>
                {item.summary || item.top_anomaly || item.verdict || item.id || 'Parsed result'}
              </b>
              <span>
                {caseId || 'No case'} · {(item.tool || 'Unknown tool')} · {fmtDate(item.created_at)}
                {caseId && (
                  <button
                    type="button"
                    className="parsedResultCaseCopy"
                    onClick={() => copyValue(caseId, `${rowId}:case`)}
                    title="Copy case ID"
                  >
                    {copiedCase ? 'Copied' : 'Copy case'}
                  </button>
                )}
              </span>
              <span>
                <em className={`severityPill ${severityClass(item.severity)}`}>
                  {severityValue(item.severity)}
                </em>
                {' '}
                Confidence: {Number(item.confidence ?? 0).toFixed(2)}
                {suspect ? ` · Suspect: ${suspect}` : ''}
                {suspect && (
                  <button
                    type="button"
                    className="parsedResultCaseCopy"
                    onClick={() => copyValue(suspect, `${rowId}:suspect`)}
                    title="Copy top suspect"
                  >
                    {copiedSuspect ? 'Copied' : 'Copy suspect'}
                  </button>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
