import EvidenceHistory from './EvidenceHistory.jsx'
import EvidenceUploader from './EvidenceUploader.jsx'

const TOOL_COPY = {
  logs: {
    title: 'Log Analysis Evidence Archive',
    note: 'Shared archive for Log Analysis. WP-SCOUT process evidence is available from the Process Evidence view inside Log Analysis.',
    tags: ['log-analysis', 'wp-scout', 'sap-rca'],
    accept: '.log,.txt,.zip,.gz,.csv',
  },
  analyzer: {
    title: 'ST03N Analysis Evidence Archive',
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
