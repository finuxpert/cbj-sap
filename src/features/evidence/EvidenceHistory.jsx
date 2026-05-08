import React from 'react'
import { evidenceDownloadUrl, listEvidence } from '../../evidence-api-client.js'

export default function EvidenceHistory({ tool = '', limit = 20, onSelect }) {
  const [items, setItems] = React.useState([])
  const [selectedId, setSelectedId] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  const refresh = React.useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await listEvidence({ tool, limit })
      const nextItems = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.evidence)
          ? data.evidence
          : Array.isArray(data)
            ? data
            : []
      setItems(nextItems)
    } catch (err) {
      console.error('[EvidenceHistory] load failed:', err)
      setError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }, [tool, limit])

  React.useEffect(() => {
    refresh()
  }, [refresh])

  const selectItem = React.useCallback((item, id) => {
    setSelectedId(id)
    onSelect?.(item)
  }, [onSelect])

  return (
    <section className="evidenceHistory card soft">
      <div className="evidenceHistoryHead">
        <div>
          <span className="sectionKicker">Evidence History</span>
          <h3>Server-side evidence</h3>
        </div>
        <button className="btn ghost" type="button" onClick={refresh} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error ? <div className="evidenceError">{error}</div> : null}
      {!loading && !items.length ? <div className="muted">No evidence found yet.</div> : null}

      <div className="evidenceList">
        {items.map((item, index) => {
          const id = item.id || item.evidence_id || item.name || `${index}`
          const name = item.title || item.filename || item.name || `Evidence ${index + 1}`
          const created = item.created_at || item.createdAt || item.timestamp || ''
          const itemTool = item.tool || tool || 'unknown'
          const active = selectedId === id

          return (
            <div className={`evidenceItem evidenceHistoryRow ${active ? 'isSelected' : ''}`} key={id}>
              <button
                className="evidenceHistorySelect"
                type="button"
                onClick={() => selectItem(item, id)}
                title="Select evidence"
              >
                <strong>{name}</strong>
                <span>{itemTool}{created ? ` • ${created}` : ''}</span>
              </button>

              <a
                className="evidenceHistoryDownload"
                href={evidenceDownloadUrl(id)}
                onClick={(event) => event.stopPropagation()}
                title="Download evidence file"
              >
                Download
              </a>
            </div>
          )
        })}
      </div>
    </section>
  )
}
