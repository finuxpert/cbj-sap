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
const GRAPH_COLORS = ['#60a5fa', '#a78bfa', '#facc15', '#34d399', '#38bdf8', '#fb7185']

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

function evidenceName(row = {}, fallback = 'ST03N item') {
  return compactLabel(row.label || row.name || row.program || row.transaction || row.fileName || row.kind || fallback, 28)
}

function metricMax(rows = [], metric) {
  return Math.max(1, ...rows.map((row) => Number(row[metric] || 0)))
}

function dominantKind(row = {}) {
  const entries = [
    ['response', Number(row.response || row.responseMs || 0)],
    ['db', Number(row.db || row.dbMs || 0)],
    ['wait', Number(row.wait || row.waitMs || 0)],
  ]
  return entries.sort((a, b) => b[1] - a[1])[0]?.[0] || 'response'
}

function graphRows(rows = [], limit = 6) {
  return rows.slice(0, limit).map((row, index) => ({
    ...row,
    name: evidenceName(row),
    color: GRAPH_COLORS[index % GRAPH_COLORS.length],
    response: Math.round(row.response ?? row.responseMs ?? 0),
    db: Math.round(row.db ?? row.dbMs ?? 0),
    wait: Math.round(row.wait ?? row.waitMs ?? 0),
    steps: Math.round(row.steps || 0),
  }))
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
      <KpiCard label="Top Program" value={evidenceName(topProgram, 'No data')} hint={topProgram ? `${topProgram.kind} · ${topProgram.component}` : 'No data'} />
      <KpiCard label="Highest Response" value={highResp ? `${fmt(highResp.responseMs, 0)}ms` : '-'} hint={evidenceName(highResp)} />
      <KpiCard label="Highest DB Time" value={highDb ? `${fmt(highDb.dbMs, 0)}ms` : '-'} hint={evidenceName(highDb)} />
      <KpiCard label="Highest Steps" value={highSteps ? fmt(highSteps.steps, 0) : '-'} hint={evidenceName(highSteps)} />
    </section>
  )
}

function BubbleImpactGraph({ rows = [] }) {
  const data = graphRows(rows, 7)
  const maxResp = metricMax(data, 'response')
  const maxDb = metricMax(data, 'db')
  const maxWait = metricMax(data, 'wait')

  return (
    <section className="evidencePanel st03nBreakdownPanel visual">
      <div className="panelTitleRow">
        <h2>Response vs DB Impact Map</h2>
        <span>Bubble size = Wait</span>
      </div>
      <svg viewBox="0 0 760 300" width="100%" height="300" role="img" aria-label="ST03N response database wait bubble chart">
        <rect x="0" y="0" width="760" height="300" rx="18" fill="rgba(15,23,42,.25)" />
        <line x1="70" y1="235" x2="720" y2="235" stroke="rgba(148,163,184,.35)" />
        <line x1="70" y1="35" x2="70" y2="235" stroke="rgba(148,163,184,.35)" />
        <text x="70" y="270" fill="rgba(203,213,225,.75)" fontSize="12">Response time →</text>
        <text x="18" y="48" fill="rgba(203,213,225,.75)" fontSize="12" transform="rotate(-90 18,48)">DB time →</text>
        {data.map((row, index) => {
          const x = 80 + (row.response / maxResp) * 620
          const y = 225 - (row.db / maxDb) * 175
          const r = 9 + Math.sqrt(row.wait / maxWait) * 22
          return (
            <g key={`${row.name}-${index}`}>
              <circle cx={x} cy={y} r={r} fill={row.color} opacity="0.62" stroke="rgba(255,255,255,.72)" strokeWidth="1" />
              <text x={Math.min(x + r + 6, 640)} y={y + 4} fill="rgba(248,250,252,.92)" fontSize="12" fontWeight="800">{row.name}</text>
            </g>
          )
        })}
      </svg>
      <div className="evidenceList compact finalEvidenceList st03nCompactList">
        {data.slice(0, 3).map((row) => (
          <div key={`${row.name}-bubble-note`}>
            <b>{row.name}</b>
            <span>{dominantKind(row).toUpperCase()} dominant · Resp {fmt(row.response, 0)}ms · DB {fmt(row.db, 0)}ms · Wait {fmt(row.wait, 0)}ms</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function ComponentDonutGraph({ analysis }) {
  const rows = (analysis.componentRows || []).slice(0, 5)
  const total = Math.max(1, rows.reduce((sum, row) => sum + Number(row.value || 0), 0))
  let offset = 25

  return (
    <section className="evidencePanel st03nComponentPanel visual">
      <div className="panelTitleRow">
        <h2>Component Mix</h2>
        <span>Workload type split</span>
      </div>
      <svg viewBox="0 0 320 240" width="100%" height="240" role="img" aria-label="ST03N component donut chart">
        <circle cx="112" cy="112" r="70" fill="transparent" stroke="rgba(148,163,184,.16)" strokeWidth="26" />
        {rows.map((row, index) => {
          const pct = (Number(row.value || 0) / total) * 100
          const current = offset
          offset -= pct
          return (
            <circle
              key={row.name}
              cx="112"
              cy="112"
              r="70"
              fill="transparent"
              stroke={GRAPH_COLORS[index % GRAPH_COLORS.length]}
              strokeWidth="26"
              strokeDasharray={`${pct} ${100 - pct}`}
              strokeDashoffset={current}
              pathLength="100"
              transform="rotate(-90 112 112)"
            />
          )
        })}
        <text x="112" y="106" textAnchor="middle" fill="rgba(248,250,252,.95)" fontSize="24" fontWeight="900">{fmt(total, 0)}</text>
        <text x="112" y="128" textAnchor="middle" fill="rgba(203,213,225,.72)" fontSize="12" fontWeight="700">hits</text>
        {rows.map((row, index) => (
          <g key={`${row.name}-legend`}>
            <rect x="210" y={54 + index * 30} width="10" height="10" rx="3" fill={GRAPH_COLORS[index % GRAPH_COLORS.length]} />
            <text x="228" y={63 + index * 30} fill="rgba(248,250,252,.92)" fontSize="12" fontWeight="800">{row.name}</text>
            <text x="228" y={78 + index * 30} fill="rgba(203,213,225,.72)" fontSize="11">{fmt(row.value, 0)} hits</text>
          </g>
        ))}
      </svg>
    </section>
  )
}

function SparklinePanel({ title, tag, rows = [], metric, unit = '' }) {
  const data = graphRows(rows, 6)
  const maxValue = metricMax(data, metric)
  const points = data.map((row, index) => {
    const x = 28 + index * (300 / Math.max(1, data.length - 1))
    const y = 138 - (Number(row[metric] || 0) / maxValue) * 95
    return `${x},${y}`
  }).join(' ')

  return (
    <section className="evidencePanel st03nMetricPanel visual">
      <div className="panelTitleRow">
        <h2>{title}</h2>
        <span>{tag}</span>
      </div>
      <svg viewBox="0 0 360 170" width="100%" height="170" role="img" aria-label={`${title} sparkline`}>
        <line x1="28" y1="140" x2="334" y2="140" stroke="rgba(148,163,184,.24)" />
        <line x1="28" y1="42" x2="28" y2="140" stroke="rgba(148,163,184,.24)" />
        <polyline points={points} fill="none" stroke="rgba(56,189,248,.95)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((row, index) => {
          const x = 28 + index * (300 / Math.max(1, data.length - 1))
          const y = 138 - (Number(row[metric] || 0) / maxValue) * 95
          return <circle key={`${row.name}-${metric}`} cx={x} cy={y} r="5" fill={GRAPH_COLORS[index % GRAPH_COLORS.length]} stroke="rgba(255,255,255,.72)" />
        })}
      </svg>
      <div className="evidenceList compact finalEvidenceList st03nCompactList">
        {data.slice(0, 3).map((row) => (
          <div key={`${row.name}-${metric}-note`}>
            <b>{row.name}</b>
            <span>{fmt(row[metric], 0)}{unit}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function EvidenceFocusPanel({ rows = [] }) {
  return (
    <section className="evidencePanel st03nImpactMatrixPanel">
      <div className="panelTitleRow">
        <h2>Top ST03N Evidence</h2>
        <span>Basis review queue</span>
      </div>
      <div className="evidenceList compact finalEvidenceList st03nCompactList">
        {rows.slice(0, 3).map((row, index) => {
          const kind = dominantKind(row)
          return (
            <div key={`${row.name}-${index}`}>
              <b>{evidenceName(row)}</b>
              <span>{kind.toUpperCase()} dominant · score {row.score}/100</span>
              <small>Response {fmt(row.response, 0)}ms · DB {fmt(row.db, 0)}ms · Wait {fmt(row.wait, 0)}ms</small>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function BreakdownPanel({ rows = [] }) {
  return (
    <section className="evidencePanel st03nBreakdownPanel basisBreakdownPanel">
      <div className="panelTitleRow">
        <h2>Response / DB / Wait Breakdown</h2>
        <span>Main Basis analysis</span>
      </div>
      <div className="evidenceList finalEvidenceList st03nCompactList basisBreakdownList">
        {rows.slice(0, 5).map((row, index) => {
          const kind = dominantKind(row)
          return (
            <div key={`${row.name}-breakdown-${index}`}>
              <b>{evidenceName(row)}</b>
              <span>{kind.toUpperCase()} dominant · Score {row.score}/100 · Steps {fmt(row.steps, 0)}</span>
              <small>Response {fmt(row.response, 0)}ms · DB {fmt(row.db, 0)}ms · Wait {fmt(row.wait, 0)}ms</small>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function OffenderRanking({ topRows }) {
  return (
    <section className="evidencePanel st03nOffenderPanel compactOffenderPanel">
      <div className="panelTitleRow">
        <h2>ST03N Offender Ranking</h2>
        <span>Compact review list</span>
      </div>
      <div className="evidenceList finalEvidenceList st03nCompactList">
        {topRows.slice(0, 6).map((row) => (
          <div key={`${row.kind}-${row.fileName}-${row.label || row.name}-ranking`}>
            <b>{evidenceName(row)}</b>
            <span>{row.kind} · {row.component} · score {row.score}/100</span>
            <small>Response {fmt(row.responseMs, 0)}ms · DB {fmt(row.dbMs, 0)}ms · Wait {fmt(row.waitMs, 0)}ms · Steps {fmt(row.steps, 0)}</small>
          </div>
        ))}
      </div>
    </section>
  )
}

function EvidenceCharts({ analysis, topRows }) {
  const chartRows = graphRows(topRows, 8)
  const topResponseRows = [...chartRows].sort((a, b) => b.response - a.response).slice(0, 6)
  const topDbRows = [...chartRows].sort((a, b) => b.db - a.db).slice(0, 6)
  const topStepRows = [...chartRows].sort((a, b) => b.steps - a.steps).slice(0, 6)

  return (
    <>
      <KpiStrip topRows={topRows} />
      <div className="st03nDashboardBoard" style={dashboardGridStyle}>
        <div style={span(8)}><BubbleImpactGraph rows={chartRows} /></div>
        <div style={span(4)}><ComponentDonutGraph analysis={analysis} /></div>
        <div style={span(12)}><BreakdownPanel rows={chartRows} /></div>
        <div style={span(4)}><SparklinePanel title="Response Trend" tag="Dialog impact" rows={topResponseRows} metric="response" unit="ms" /></div>
        <div style={span(4)}><SparklinePanel title="DB Time Trend" tag="Database pressure" rows={topDbRows} metric="db" unit="ms" /></div>
        <div style={span(4)}><SparklinePanel title="Steps Trend" tag="Execution volume" rows={topStepRows} metric="steps" /></div>
        <div style={span(12)}><EvidenceFocusPanel rows={chartRows} /></div>
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
