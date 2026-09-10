import React from 'react'

const API = `${import.meta.env.BASE_URL}api`

export default function RundeckSource({ onCollection }) {
  const [latest, setLatest] = React.useState(null)
  const [error, setError] = React.useState('')
  const loaded = React.useRef('')
  React.useEffect(() => {
    let active = true
    const controller = new AbortController()
    let timer
    async function refresh() {
      try {
        const response = await fetch(`${API}/collections/latest`, { cache: 'no-store', signal: controller.signal })
        if (response.status === 404) throw new Error('No READY collection available. Manual Upload Logs remains available.')
        if (!response.ok) throw new Error('Unable to load Rundeck collection.')
        const collection = await response.json()
        if (collection.status !== 'READY') throw new Error('Collection is not READY.')
        if (active && loaded.current !== collection.collection_id) {
          const raw = await fetch(`${API}/collections/${encodeURIComponent(collection.collection_id)}/raw`, { cache: 'no-store', signal: controller.signal })
          if (!raw.ok) throw new Error('Unable to download collection.')
          const blob = await raw.blob()
          if (!active) return
          await onCollection([new File([blob], `${collection.collection_id}.log`, { type: 'text/plain' })])
          if (!active) return
          loaded.current = collection.collection_id
        }
        if (active) { setLatest(collection); setError('') }
      } catch (failure) {
        if (active) setError(failure.message)
      } finally {
        if (active) timer = setTimeout(refresh, 60000)
      }
    }
    refresh()
    return () => { active = false; controller.abort(); clearTimeout(timer) }
  }, [onCollection])
  return <section aria-label="Rundeck collection" aria-live="polite">
    {error && <p role="status">{error}</p>}
    <dl>
      <dt>Latest Collection</dt><dd>{latest?.collection_id || '—'}</dd>
      <dt>Execution ID</dt><dd>{latest?.execution_id || '—'}</dd>
      <dt>Collection Time</dt><dd>{latest?.finished_at || '—'}</dd>
      <dt>Host Count</dt><dd>{latest ? `${latest.received_hosts.length} / ${latest.expected_hosts.length}` : '—'}</dd>
      <dt>Status</dt><dd>{latest?.status || 'WAITING'}</dd>
    </dl>
  </section>
}
