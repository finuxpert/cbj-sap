import React from 'react'
import { getRecentEvidence, fmt, latestRcaSession, loadJson, saveJson } from './evidence-utils.js'
import {
  DecisionCard,
  EmptyState,
  EvidenceServerPanel,
  EvidenceToolbar,
  SessionBanner,
  UploadedFilesPanel,
} from './EvidenceDecisionKit.jsx'
import {
  buildSt03nAnalysis,
  classifySt03nFile,
  expandSt03nFiles,
  parseSt03nFile,
  REQUIRED_ST03N,
} from './parsers/st03nParser.js'
import './ToolEvidenceSpecialist.css'

const CACHE_KEY = 'sap_st03n_impact_v2_cache'
const ACCEPTED_TYPES = ['.xlsx', '.xls', '.csv', '.zip']

const dashboardGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
  gap: 14,
  alignItems: 'start',
  marginTop: 14,
}

const span = (cols) => ({ gridColumn: `span ${cols}` })

function compactLabel(value = '', max = 18) {
  const label = String(value || 'Unknown').trim() || 'Unknown'
  return label.length > max ? `${label.slice(0, Math.max(8, max - 1))}…` : label
}

function metricMax(rows = [], metric) {
  return Math.max(1, ...rows.map((row) => Number(row[metric] || 0)))
}

function severityClass(pct = 0) {
  if (pct >= 85) return 'critical'
  if (pct >= 60) return 'major'
  if (pct >= 30) return 'medium'
  return 'low'
}

function dominantKind(row = {}) {
  const entries = [
    ['response', Number(row.response || row.responseMs || 0)],
    ['db', Number(row.db || row.dbMs || 0)],
    ['wait', Number(row.wait || row.waitMs || 0)],
  ]
  return entries.sort((a, b) => b[1] - a[1])[0]?.[0] || 'response'
}

function buildReportText(analysis) {
  if (!analysis) return ''
  const top = analysis.top
  return [
    'SAP ST03N Impact Summary',
    `Verdict: ${analysis.verdict}`,
    `Confidence: ${analysis.confidence}% - ${analysis.correlation}`,
    `Completeness: ${analysis.completeness}%`,
    `Dominant Component: ${analysis.dominant}`,
    top ? `Top Evidence: ${top.label}` : 'Top Evidence: -',
    top ? `Component: ${top.component}` : 'Component: -',
    top ? `Response: ${fmt(top.responseMs, 0)}ms | DB: ${fmt(top.dbMs, 0)}ms | Wait: ${fmt(top.waitMs, 0)}ms` : '',
    `Next Action: ${analysis.nextAction}`,
  ].filter(Boolean).join('\n')
}

function AcceptedTypes({ items }) {
  return <div className="acceptedTypes">{items.map((item) => <span key={item}>{item}</span>)}</div>
}

function ToolHero({ busy, onFiles }) {
  return (
    <header className="evidenceHero compactEvidenceHero finalHero">
      <div className="heroCopyBlock">
        <span>ST03N Impact Analyzer</span>
        <h1>Workload impact drilldown.</h1>
        <p>Validate SAP workload impact from uploaded ST03N evidence: verdict, dominant component, parse completeness, and top offender.</p>
      </div>
      <label className="evidenceUpload finalUpload">
        <input type="file" multiple accept=".zip,.xlsx,.xls,.csv" onChange={(event) => onFiles(event.target.files)} />
        <strong>{busy ? 'Parsing…' : 'Upload ST03N Evidence'}</strong>
        <small>Accepted files</small>
        <AcceptedTypes items={ACCEPTED_TYPES} />
      </label>
    </header>
  )
}

function ParseStatusPanel({ analysis, detected }) {
  const cachedFiles = analysis?.files || []

  return (
    <section className="evidencePanel parsePanel">
      <div className="panelTitleRow">
        <h2>Parse Status</h2>
        <span>Required ST03N pack</span>
      </div>
      <div className="statusList finalStatusList">
        {REQUIRED_ST03N.map((required) => {
          const parsed = analysis?.parseStatus?.filter((item) => item.key === required.key) || []
          const okStatus = parsed.find((item) => item.ok)
          const parsedFileStatus = parsed.find((item) => item.fileName)
          const cachedFile = cachedFiles.find((file) => classifySt03nFile(file.name) === required.key)
          const currentFile = detected[required.key]?.[0]
          const hasRecognizedFile = Boolean(currentFile || cachedFile || parsedFileStatus)
          const statusClass = okStatus ? 'ok' : hasRecognizedFile ? 'detected' : 'missing'
          const badge = okStatus ? 'Ready' : hasRecognizedFile ? 'Detected' : 'Missing'
          const message = currentFile?.name
            || parsedFileStatus?.fileName
            || cachedFile?.name
            || parsed[0]?.message
            || 'missing'
          const subMessage = !okStatus && hasRecognizedFile && parsed[0]?.message && parsed[0]?.message !== 'missing'
            ? parsed[0].message
            : message

          return (
            <div key={required.key} className={statusClass}>
              <em>{badge}</em>
              <b>{required.label}</b>
              <span>{subMessage}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function InterpretationPanel({ top, status }) {
  return (
    <section className="evidencePanel interpretationPanel">
      <div className="panelTitleRow">
        <h2>Interpretation</h2>
        <span>Basis RCA signal</span>
      </div>
      {top ? (
        <>
          <p><b>{top.label}</b> is the strongest parsed ST03N signal and is classified as <b>{top.component}</b>.</p>
          <div className="confidenceRows finalMetricRows">
            <span>Score<b>{top.score}/100</b></span>
            <span>Response<b>{fmt(top.responseMs, 0)}ms</b></span>
            <span>DB Share<b>{fmt(top.dbShare)}%</b></span>
          </div>
        </>
      ) : <p>{status}</p>}
    </section>
  )
}

function KpiCard({ label, value, hint }) {
  return (
    <div className="st03nKpiCard">
      <span>{label}</span>
      <b>{value}</b>
      <small>{hint}</small>
    </div>
  )
}

function KpiStrip({ topRows }) {
  const topProgram = topRows[0]
  const highResp = [...topRows].sort((a, b) => b.responseMs - a.responseMs)[0]
  const highDb = [...topRows].sort((a, b) => b.dbMs - a.dbMs)[0]
  const highSteps = [...topRows].sort((a, b) => b.steps - a.steps)[0]

  return (
    <section className="st03nKpiStrip">
      <KpiCard label="Top Program" value={compactLabel(topProgram?.label, 22)} hint={topProgram ? `${topProgram.kind} · ${topProgram.component}` : 'No data'} />
      <KpiCard label="Highest Response" value={highResp ? `${fmt(highResp.responseMs, 0)}ms` : '-'} hint={compactLabel(highResp?.label, 24)} />
      <KpiCard label="Highest DB Time" value={highDb ? `${fmt(highDb.dbMs, 0)}ms` : '-'} hint={compactLabel(highDb?.label, 24)} />
      <KpiCard label="Highest Steps" value={highSteps ? fmt(highSteps.steps, 0) : '-'} hint={compactLabel(highSteps?.label, 24)} />
    </section>
  )
}

function MetricRows({ rows = [], metric, unit = '', maxRows = 5, tone = 'score' }) {
  const max = metricMax(rows, metric)
  return (
    <div className="st03nMetricRows">
      {rows.slice(0, maxRows).map((row, index) => {
        const value = Number(row[metric] || 0)
        const pct = Math.max(4, Math.min(100, (value / max) * 100))
        return (
          <div key={`${row.name}-${metric}-${index}`} className={`st03nMetricRow ${tone} ${severityClass(pct)}`}>
            <div>
              <b>{row.name}</b>
              <span>{fmt(value, 0)}{unit}</span>
            </div>
            <i style={{ width: `${pct}%` }} />
          </div>
        )
      })}
    </div>
  )
}

function MetricPanel({ title, tag, rows = [], metric, unit = '', maxRows = 5, tone = 'score' }) {
  return (
    <section className="evidencePanel st03nMetricPanel">
      <div className="panelTitleRow">
        <h2>{title}</h2>
        <span>{tag}</span>
      </div>
      <MetricRows rows={rows} metric={metric} unit={unit} maxRows={maxRows} tone={tone} />
    </section>
  )
}

function ImpactMatrixPanel({ rows = [] }) {
  return (
    <section className="evidencePanel st03nImpactMatrixPanel">
      <div className="panelTitleRow">
        <h2>Top ST03N Evidence</h2>
        <span>Impact heatmap</span>
      </div>
      <div className="st03nImpactCards">
        {rows.slice(0, 6).map((row, index) => {
          const kind = dominantKind(row)
          return (
            <div key={`${row.name}-${index}`} className={`st03nImpactCard ${kind}`}>
              <div>
                <b>{row.name}</b>
                <em>{kind.toUpperCase()} dominant</em>
              </div>
              <p>
                <span>Score <strong>{row.score}</strong></span>
                <span>Resp <strong>{fmt(row.response, 0)}ms</strong></span>
                <span>DB <strong>{fmt(row.db, 0)}ms</strong></span>
                <span>Wait <strong>{fmt(row.wait, 0)}ms</strong></span>
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function BreakdownPanel({ rows = [] }) {
  return (
    <section className="evidencePanel st03nBreakdownPanel visual">
      <div className="panelTitleRow">
        <h2>Response / DB / Wait Breakdown</h2>
        <span>Top workload split</span>
      </div>
      <div className="st03nBreakdownLegend">
        <span className="resp">Response</span>
        <span className="db">DB</span>
        <span className="wait">Wait</span>
      </div>
      <div className="st03nBreakdownRows">
        {rows.slice(0, 6).map((row, index) => {
          const total = Math.max(1, row.response + row.db + row.wait)
          const respPct = Math.max(3, (row.response / total) * 100)
          const dbPct = Math.max(3, (row.db / total) * 100)
          const waitPct = Math.max(3, (row.wait / total) * 100)
          const kind = dominantKind(row)
          return (
            <div key={`${row.name}-breakdown-${index}`} className={`st03nBreakdownRow ${kind}`}>
              <div>
                <b>{row.name}</b>
                <em>{kind.toUpperCase()}</em>
                <span>Resp {fmt(row.response, 0)}ms · DB {fmt(row.db, 0)}ms · Wait {fmt(row.wait, 0)}ms</span>
              </div>
              <p>
                <i className="resp" style={{ width: `${respPct}%` }} />
                <i className="db" style={{ width: `${dbPct}%` }} />
                <i className="wait" style={{ width: `${waitPct}%` }} />
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function ComponentMix({ analysis, topRows }) {
  const rows = analysis.componentRows?.length ? analysis.componentRows : []
  return (
    <section className="evidencePanel st03nComponentPanel">
      <div className="panelTitleRow">
        <h2>Component Mix</h2>
        <span>Classified rows</span>
      </div>
      <MetricRows rows={rows.map((row) => ({ name: row.name, hits: row.value }))} metric="hits" unit=" hits" maxRows={4} tone="component" />
      <div className="evidenceList compact finalEvidenceList st03nCompactList">
        {topRows.slice(0, 3).map((row) => (
          <div key={`${row.kind}-${row.fileName}-${row.label}`}>
            <b>{row.label}</b>
            <span>{row.kind} · {row.component} · score {row.score}/100</span>
            <small>Response {fmt(row.responseMs, 0)}ms · DB {fmt(row.dbMs, 0)}ms · Wait {fmt(row.waitMs, 0)}ms</small>
          </div>
        ))}
      </div>
    </section>
  )
}

function OffenderRanking({ topRows }) {
  return (
    <section className="evidencePanel st03nOffenderPanel">
      <div className="panelTitleRow">
        <h2>ST03N Offender Ranking</h2>
        <span>Basis review list</span>
      </div>
      <div className="evidenceList finalEvidenceList st03nCompactList">
        {topRows.slice(0, 8).map((row) => (
          <div key={`${row.kind}-${row.fileName}-${row.label}-ranking`}>
            <b>{row.label}</b>
            <span>{row.kind} · {row.component} · score {row.score}/100</span>
            <small>Response {fmt(row.responseMs, 0)}ms · DB {fmt(row.dbMs, 0)}ms · Wait {fmt(row.waitMs, 0)}ms · Steps {fmt(row.steps, 0)}</small>
          </div>
        ))}
      </div>
    </section>
  )
}

function EvidenceCharts({ analysis, topRows }) {
  const chartRows = topRows.slice(0, 8).map((row, index) => ({
    name: compactLabel(row.label, 18),
    rank: `#${index + 1}`,
    score: row.score || 0,
    response: Math.round(row.responseMs || 0),
    db: Math.round(row.dbMs || 0),
    wait: Math.round(row.waitMs || 0),
    steps: Math.round(row.steps || 0),
  }))
  const topResponseRows = [...chartRows].sort((a, b) => b.response - a.response).slice(0, 5)
  const topDbRows = [...chartRows].sort((a, b) => b.db - a.db).slice(0, 5)
  const topStepRows = [...chartRows].sort((a, b) => b.steps - a.steps).slice(0, 5)

  return (
    <>
      <KpiStrip topRows={topRows} />
      <div className="st03nDashboardBoard" style={dashboardGridStyle}>
        <div style={span(7)}><ImpactMatrixPanel rows={chartRows} /></div>
        <div style={span(5)}><ComponentMix analysis={analysis} topRows={topRows} /></div>
        <div style={span(12)}><BreakdownPanel rows={chartRows} /></div>
        <div style={span(4)}><MetricPanel title="Top Response Time" tag="Dialog impact" rows={topResponseRows} metric="response" unit="ms" tone="response" /></div>
        <div style={span(4)}><MetricPanel title="Top DB Time" tag="Database pressure" rows={topDbRows} metric="db" unit="ms" tone="db" /></div>
        <div style={span(4)}><MetricPanel title="Steps Volume" tag="Execution volume" rows={topStepRows} metric="steps" tone="steps" /></div>
        <div style={span(12)}><OffenderRanking topRows={topRows} /></div>
      </div>
    </>
  )
}

export default function ToolSt03nImpactV2() {
  const [session] = React.useState(latestRcaSession)
  const [files, setFiles] = React.useState([])
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('Upload ST03N pack or ZIP to validate workload impact.')
  const [analysis, setAnalysis] = React.useState(() => loadJson(CACHE_KEY, null))
  const [serverInfo, setServerInfo] = React.useState(null)

  React.useEffect(() => {
    let active = true
    getRecentEvidence({ tool: 'investigation', limit: 5 }).then((response) => {
      if (active) setServerInfo(response)
    })
    return () => { active = false }
  }, [])

  const detected = React.useMemo(() => {
    const map = Object.fromEntries(REQUIRED_ST03N.map((item) => [item.key, []]))
    files.forEach((file) => {
      const key = classifySt03nFile(file.name)
      if (key) map[key].push(file)
    })
    return map
  }, [files])

  const analyze = async (nextFiles = files) => {
    setBusy(true)
    setStatus('Parsing ST03N evidence…')
    try {
      const rows = []
      const parseStatus = []

      for (const required of REQUIRED_ST03N) {
        const group = nextFiles.filter((file) => classifySt03nFile(file.name) === required.key)
        if (!group.length) {
          parseStatus.push({ key: required.key, label: required.label, ok: false, rows: 0, message: 'missing' })
          continue
        }

        for (const file of group) {
          const parsed = await parseSt03nFile(file, REQUIRED_ST03N)
          rows.push(...parsed.rows)
          parseStatus.push(parsed.status)
        }
      }

      rows.sort((a, b) => b.score - a.score)
      const result = buildSt03nAnalysis(nextFiles.map((file) => ({ name: file.name, size: file.size })), parseStatus, rows, serverInfo)
      setAnalysis(result)
      saveJson(CACHE_KEY, result)
      setStatus('ST03N analysis complete.')
    } catch (error) {
      setStatus(error?.message || 'Failed to analyze ST03N files.')
    } finally {
      setBusy(false)
    }
  }

  const onFiles = async (fileList) => {
    setBusy(true)
    try {
      const expanded = await expandSt03nFiles(fileList)
      setFiles(expanded)
      await analyze(expanded)
    } catch (error) {
      setStatus(error?.message || 'Failed to read upload.')
    } finally {
      setBusy(false)
    }
  }

  const topRows = analysis?.rows?.slice(0, 12) || []
  const top = analysis?.top
  const displayedFiles = files.length ? files : (analysis?.files || [])

  return (
    <section className="evidenceToolShell refinedTool finalRcaTool st03nImpactShell">
      <ToolHero busy={busy} onFiles={onFiles} />
      <SessionBanner session={session} />
      <EvidenceToolbar analysis={analysis} cacheKey={CACHE_KEY} reportText={buildReportText(analysis)} filenamePrefix="sap-st03n-impact-v2" />

      <section className="decisionBoard finalDecisionBoard">
        <DecisionCard label="Impact Verdict" value={analysis?.verdict || 'Pending'} hint={analysis?.nextAction || status} tone={analysis?.verdict === 'Detected' ? 'good' : ''} />
        <DecisionCard label="Dominant Component" value={analysis?.dominant || 'Unknown'} hint="Derived from response, DB, wait, CPU columns" tone="blue" />
        <DecisionCard label="Confidence" value={`${analysis?.confidence || 0}%`} hint={analysis?.correlation || 'Pending upload'} />
        <DecisionCard label="Completeness" value={`${analysis?.completeness || 0}%`} hint="Required ST03N pack coverage" />
      </section>

      <div className="evidenceGrid st03nSummaryGrid">
        <ParseStatusPanel analysis={analysis} detected={detected} />
        <InterpretationPanel top={top} status={status} />
      </div>

      {analysis ? (
        <EvidenceCharts analysis={analysis} topRows={topRows} />
      ) : (
        <EmptyState title="Upload ST03N evidence pack">
          <p>Upload the required ST03N Excel, CSV, or ZIP evidence. This analyzer ranks workload impact only from uploaded files.</p>
          <ol>
            <li>Upload Time Profile, Workload, Transaction Standard, Top Response, and Top DB.</li>
            <li>Review parse status and completeness.</li>
            <li>Use Top ST03N Evidence to confirm whether workload impact supports the RCA window.</li>
          </ol>
        </EmptyState>
      )}

      <div className="evidenceGrid st03nFooterGrid">
        <UploadedFilesPanel files={displayedFiles} />
        <EvidenceServerPanel serverInfo={serverInfo} />
      </div>
    </section>
  )
}
