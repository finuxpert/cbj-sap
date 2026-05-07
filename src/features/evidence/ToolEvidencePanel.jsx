import EvidenceHistory from './EvidenceHistory.jsx'
import EvidenceUploader from './EvidenceUploader.jsx'

const TOOL_COPY = {
  logs: {
    title: 'Log Triage Evidence Archive',
    note: 'Evidence archive for Log Triage. Parser workflow remains inside the tool below.',
    tags: ['log-triage', 'sap-rca'],
    accept: '.log,.txt,.zip,.gz,.csv',
  },
  comparer: {
    title: 'Comparator Evidence Archive',
    note: 'Evidence archive for RCA Comparator / WP-SCOUT snapshots.',
    tags: ['comparer', 'wp-scout', 'sap-rca'],
    accept: '.log,.txt,.zip,.gz,.csv',
  },
  analyzer: {
    title: 'ST03N Evidence Archive',
    note: 'Evidence archive for ST03N workload exports.',
    tags: ['st03n', 'workload', 'sap-rca'],
    accept: '.xlsx,.xls,.csv,.zip',
  },
}

export default function ToolEvidencePanel({ tool }) {
  const copy = TOOL_COPY[tool]
  if (!copy) return null

  return (
    <section className="toolEvidencePanel container">
      <div className="toolEvidenceIntro">
        <span className="sectionKicker">Evidence API</span>
        <strong>{copy.title}</strong>
        <small>{copy.note}</small>
      </div>
      <EvidenceUploader
        tool={tool}
        title={copy.title}
        note={copy.note}
        tags={copy.tags}
        accept={copy.accept}
      />
      <EvidenceHistory tool={tool} limit={8} />
    </section>
  )
}
