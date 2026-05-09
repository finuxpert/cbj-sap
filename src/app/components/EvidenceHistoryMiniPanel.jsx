import { useEffect, useMemo, useState } from 'react'
import { evidenceDownloadUrl, listEvidenceHistory } from '../../evidence-api-client.js'

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

function normalizeEvidenceResponse(payload) {
  if (Array.isArray(payload)) {
    return {
      ok: true,
      readSource: 'legacy_array',
      count: payload.length,
      evidence: payload,
      fallbackReason: null,
    }
  }

  const evidence = Array.isArray(payload?.evidence)
    ? payload.evidence
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.items)
        ? payload.items
        : []

  return {
    ok: Boolean(payload?.ok ?? true),
    readSource: payload?.read_source || payload?.readSource || 'unknown',
    mode: payload?.mode || 'unknown',
    count: Number(payload?.count ?? evidence.length),
    evidence,
    fallbackReason: payload?.fallback_reason || payload?.fallbackReason || null,
  }
}

export default function EvidenceHistoryMiniPanel() {
  const [state, setState] = useState({
    loading: true,
    error: '',
    payload: null,
  })

  async function loadEvidenceHistory() {
    setState((prev) => ({ ...prev, loading: true, error: '' }))

    try {
      const payload = await listEvidenceHistory({ limit: 25 })
      setState({
        loading: false,
        error: '',
        payload: normalizeEvidenceResponse(payload),
      })
    } catch (error) {
      setState({
        loading: false,
        error: error?.message || 'Failed to load evidence history',
        payload: null,
      })
    }
  }

  useEffect(() => {
    loadEvidenceHistory()
  }, [])

  const rows = useMemo(() => {
    return state.payload?.evidence?.slice(0, 8) || []
  }, [state.payload])

  return (
    <section className="resultPanel evidenceHistoryDbPanel">
      <div className="panelTitleRow">
        <div>
          <h3>Evidence History</h3>
          <p>
            PostgreSQL-backed evidence timeline for RCA investigation artifacts.
          </p>
        </div>
        <button
          type="button"
          className="investSecondary"
          onClick={loadEvidenceHistory}
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

      <div className="miniTable evidenceHistoryRows">
        {rows.length === 0 && (
          <div>
            <b>{state.loading ? 'Loading evidence history…' : 'No evidence history found'}</b>
            <span>Upload or migrate evidence to populate this panel.</span>
          </div>
        )}

        {rows.map((item) => (
          <div key={item.id || item.stored_filename || item.title}>
            <b>{item.title || item.original_filename || item.stored_filename || item.id || 'Evidence'}</b>
            <span>
              {(item.case_id || item.case_no || 'No case')} · {(item.tool || 'Unknown tool')} · {fmtDate(item.created_at)}
              {item.id ? (
                <>
                  {' · '}
                  <a href={evidenceDownloadUrl(item.id)} target="_blank" rel="noreferrer">
                    download
                  </a>
                </>
              ) : null}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
