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

export default function ParsedResultsHistoryMiniPanel() {
  const [state, setState] = useState({
    loading: true,
    error: '',
    payload: null,
  })

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

  const rows = useMemo(() => {
    return state.payload?.parsedResults?.slice(0, 8) || []
  }, [state.payload])

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
          {state.payload?.fallbackReason && (
            <span>Fallback: <b>{state.payload.fallbackReason}</b></span>
          )}
        </div>
      )}

      <div className="miniTable evidenceHistoryRows parsedResultsHistoryRows">
        {rows.length === 0 && (
          <div>
            <b>{state.loading ? 'Loading parsed results…' : 'No parsed results found'}</b>
            <span>Run and save RCA parser results to populate this panel.</span>
          </div>
        )}

        {rows.map((item) => (
          <div key={item.id || `${item.case_id}-${item.created_at}-${item.tool}`}>
            <b>
              {item.summary || item.top_anomaly || item.verdict || item.id || 'Parsed result'}
            </b>
            <span>
              {(item.case_id || 'No case')} · {(item.tool || 'Unknown tool')} · {fmtDate(item.created_at)}
            </span>
            <span>
              <em className={`severityPill ${severityClass(item.severity)}`}>
                {String(item.severity || 'INFO').toUpperCase()}
              </em>
              {' '}
              Confidence: {Number(item.confidence ?? 0).toFixed(2)}
              {item.top_suspect ? ` · Suspect: ${item.top_suspect}` : ''}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
