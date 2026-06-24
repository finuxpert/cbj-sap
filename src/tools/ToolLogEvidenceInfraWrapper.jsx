import React from 'react'
import ToolLogEvidenceV2 from './ToolLogEvidenceV2.jsx'
import LogInfraCharts from './LogInfraCharts.jsx'
import { loadJson } from './evidence-utils.js'

const CACHE_KEY = 'sap_log_evidence_v2_cache'

export default function ToolLogEvidenceInfraWrapper() {
  const [analysis, setAnalysis] = React.useState(() => loadJson(CACHE_KEY, null))

  React.useEffect(() => {
    const refresh = () => setAnalysis(loadJson(CACHE_KEY, null))
    refresh()
    window.addEventListener('storage', refresh)
    const interval = window.setInterval(refresh, 1200)
    return () => {
      window.removeEventListener('storage', refresh)
      window.clearInterval(interval)
    }
  }, [])

  return (
    <>
      <ToolLogEvidenceV2 />
      {analysis?.rows?.length ? (
        <section className="evidenceToolShell refinedTool finalRcaTool logEvidenceShell infraOnlyShell">
          <LogInfraCharts rows={analysis.rows} />
        </section>
      ) : null}
    </>
  )
}
