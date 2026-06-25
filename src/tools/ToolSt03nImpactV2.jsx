import React from 'react'
import ReactECharts from 'echarts-for-react'
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

const chartTextStyle = {
  color: 'rgba(226,232,240,.82)',
  fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

function compactLabel(value = '', max = 18) {
  const label = String(value || 'Unknown').trim() || 'Unknown'
  return label.length > max ? `${label.slice(0, Math.max(8, max - 1))}…` : label
}

function evidenceName(row = {}, fallback = 'ST03N item') {
  return compactLabel(row?.label || row?.name || row?.program || row?.transaction || row?.fileName || row?.kind || fallback, 28)
}

function metricMax(rows = [], metric) {
  return Math.max(1, ...rows.map((row) => Number(row?.[metric] || 0)))
}

function metricValue(row = {}, primary, fallback) {
  return Math.round(Number(row?.[primary] ?? row?.[fallback] ?? 0))
}

function dominantKind(row = {}) {
  const entries = [
    ['response', Number(row.response || row.responseMs || 0)],
    ['db', Number(row.db || row.dbMs || 0)],
    ['wait', Number(row.wait || row.waitMs || 0)],
    ['cpu', Number(row.cpu || row.cpuMs || 0)],
  ]
  return entries.sort((a, b) => b[1] - a[1])[0]?.[0] || 'response'
}

function graphRows(rows = [], limit = 6) {
  return rows.slice(0, limit).map((row, index) => ({
    ...row,
    name: evidenceName(row),
    color: GRAPH_COLORS[index % GRAPH_COLORS.length],
    response: metricValue(row, 'response', 'responseMs'),
    db: metricValue(row, 'db', 'dbMs'),
    wait: metricValue(row, 'wait', 'waitMs'),
    cpu: metricValue(row, 'cpu', 'cpuMs'),
    steps: Math.round(Number(row.steps || 0)),
  }))
}

function chartBaseOption(extra = {}) {
  return {
    backgroundColor: 'transparent',
    color: GRAPH_COLORS,
    textStyle: chartTextStyle,
    animationDuration: 650,
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(15,23,42,.96)',
      borderColor: 'rgba(148,163,184,.22)',
      textStyle: { color: '#e5e7eb', fontSize: 12 },
      extraCssText: 'box-shadow:0 16px 40px rgba(0,0,0,.32);border-radius:12px;',
    },
    ...extra,
  }
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
  const highResp = [...topRows].sort((a, b) => Number(b.responseMs || 0) - Number(a.responseMs || 0))[0]
  const highDb = [...topRows].sort((a, b) => Number(b.dbMs || 0) - Number(a.dbMs || 0))[0]
  const highSteps = [...topRows].sort((a, b) => Number(b.steps || 0) - Number(a.steps || 0))[0]

  return (
    <section className="st03nKpiStrip">
      <KpiCard label="Top Program" value={evidenceName(topProgram, 'No data')} hint={topProgram ? `${topProgram.kind} · ${topProgram.component}` : 'No data'} />
      <KpiCard label="Highest Response" value={highResp ? `${fmt(highResp.responseMs, 0)}ms` : '-'} hint={evidenceName(highResp)} />
      <KpiCard label="Highest DB Time" value={highDb ? `${fmt(highDb.dbMs, 0)}ms` : '-'} hint={evidenceName(highDb)} />
      <KpiCard label="Highest Steps" value={highSteps ? fmt(highSteps.steps, 0) : '-'} hint={evidenceName(highSteps)} />
    </section>
  )
}

function ChartEmptyState({ message = 'No parsed metric rows available.' }) {
  return <div className="st03nKpiCard"><span>Chart unavailable</span><b>No data</b><small>{message}</small></div>
}

function TopOffenderSplitGraph({ topRows = [] }) {
  const top = graphRows(topRows, 1)[0]
  if (!top) return null

  const data = [
    { name: 'Response', value: top.response },
    { name: 'DB Time', value: top.db },
    { name: 'Wait', value: top.wait },
  ].filter((item) => item.value > 0)

  const option = chartBaseOption({
    legend: { bottom: 0, textStyle: chartTextStyle, icon: 'circle' },
    tooltip: {
      ...chartBaseOption().tooltip,
      formatter: ({ name, value, percent }) => `${name}<br/><b>${fmt(value, 0)}ms</b> · ${fmt(percent, 0)}%`,
    },
    series: [
      {
        name: 'Top offender split',
        type: 'pie',
        radius: ['48%', '72%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 8, borderColor: 'rgba(15,23,42,.92)', borderWidth: 3 },
        label: { color: 'rgba(248,250,252,.92)', fontWeight: 800, formatter: '{b}\n{d}%' },
        labelLine: { lineStyle: { color: 'rgba(148,163,184,.45)' } },
        data,
      },
    ],
  })

  return (
    <section className="evidencePanel visual">
      <div className="panelTitleRow">
        <h2>Top Offender Split</h2>
        <span>{top.name}</span>
      </div>
      {data.length ? <ReactECharts option={option} style={{ height: 300, width: '100%' }} notMerge lazyUpdate /> : <ChartEmptyState />}
    </section>
  )
}

function BubbleImpactGraph({ rows = [] }) {
  const data = graphRows(rows, 8)
  const maxWait = metricMax(data, 'wait')
  const maxSteps = metricMax(data, 'steps')

  const option = chartBaseOption({
    grid: { left: 60, right: 28, top: 34, bottom: 58, containLabel: true },
    tooltip: {
      ...chartBaseOption().tooltip,
      formatter: ({ data: point }) => {
        const row = point?.row || {}
        return [
          `<b>#${point.rank} ${row.name}</b>`,
          `${row.kind || 'ST03N'} · ${row.component || 'Workload'}`,
          `Response: <b>${fmt(row.response, 0)}ms</b>`,
          `DB Time: <b>${fmt(row.db, 0)}ms</b>`,
          `Wait: <b>${fmt(row.wait, 0)}ms</b>`,
          `CPU: <b>${fmt(row.cpu, 0)}ms</b>`,
          `Steps: <b>${fmt(row.steps, 0)}</b>`,
        ].join('<br/>')
      },
    },
    xAxis: {
      name: 'DB Time (ms)',
      nameLocation: 'middle',
      nameGap: 36,
      splitLine: { lineStyle: { color: 'rgba(148,163,184,.12)', type: 'dashed' } },
      axisLine: { lineStyle: { color: 'rgba(148,163,184,.36)' } },
      axisLabel: { color: 'rgba(203,213,225,.74)' },
      nameTextStyle: chartTextStyle,
    },
    yAxis: {
      name: 'Response Time (ms)',
      nameGap: 42,
      splitLine: { lineStyle: { color: 'rgba(148,163,184,.12)', type: 'dashed' } },
      axisLine: { lineStyle: { color: 'rgba(148,163,184,.36)' } },
      axisLabel: { color: 'rgba(203,213,225,.74)' },
      nameTextStyle: chartTextStyle,
    },
    series: [
      {
        name: 'Response vs DB',
        type: 'scatter',
        data: data.map((row, index) => ({
          value: [row.db, row.response, row.wait, row.steps],
          rank: index + 1,
          row,
          itemStyle: { color: row.color, opacity: 0.78, borderColor: 'rgba(255,255,255,.76)', borderWidth: 1.2 },
        })),
        symbolSize: (value) => {
          const waitFactor = Math.sqrt(Number(value?.[2] || 0) / maxWait)
          const stepFactor = Math.sqrt(Number(value?.[3] || 0) / maxSteps)
          return 18 + Math.max(waitFactor, stepFactor * 0.72) * 34
        },
        label: {
          show: true,
          formatter: ({ data: point }) => String(point.rank),
          color: 'rgba(15,23,42,.98)',
          fontWeight: 950,
        },
        emphasis: { focus: 'series', scale: true },
        markArea: {
          silent: true,
          itemStyle: { color: 'rgba(248,113,113,.055)' },
          data: [[{ xAxis: '50%', yAxis: '50%' }, { xAxis: 'max', yAxis: 'max' }]],
        },
      },
    ],
  })

  return (
    <section className="evidencePanel st03nBreakdownPanel visual">
      <div className="panelTitleRow">
        <h2>Response vs DB Impact Map</h2>
        <span>Bubble size = Wait / Steps</span>
      </div>
      {data.length ? <ReactECharts option={option} style={{ height: 360, width: '100%' }} notMerge lazyUpdate /> : <ChartEmptyState />}
      <div className="evidenceList compact finalEvidenceList st03nCompactList">
        {data.slice(0, 5).map((row, index) => (
          <div key={`${row.name}-bubble-note`}>
            <b>#{index + 1} {row.name}</b>
            <span>{dominantKind(row).toUpperCase()} dominant · Resp {fmt(row.response, 0)}ms · DB {fmt(row.db, 0)}ms · Wait {fmt(row.wait, 0)}ms</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function ComponentDonutGraph({ analysis }) {
  const rows = (analysis?.componentRows || []).slice(0, 6).filter((row) => Number(row.value || 0) > 0)
  const total = rows.reduce((sum, row) => sum + Number(row.value || 0), 0)

  const option = chartBaseOption({
    legend: { bottom: 0, textStyle: chartTextStyle, icon: 'circle' },
    tooltip: {
      ...chartBaseOption().tooltip,
      formatter: ({ name, value, percent }) => `${name}<br/><b>${fmt(value, 0)} rows</b> · ${fmt(percent, 0)}%`,
    },
    series: [
      {
        name: 'Component mix',
        type: 'pie',
        radius: ['46%', '72%'],
        center: ['50%', '43%'],
        itemStyle: { borderRadius: 8, borderColor: 'rgba(15,23,42,.92)', borderWidth: 3 },
        label: { color: 'rgba(248,250,252,.9)', fontWeight: 800, formatter: '{b}\n{d}%' },
        data: rows.map((row) => ({ name: row.name, value: Number(row.value || 0) })),
      },
    ],
    graphic: total ? [{
      type: 'text',
      left: 'center',
      top: '37%',
      style: { text: `${fmt(total, 0)}\nrows`, textAlign: 'center', fill: 'rgba(248,250,252,.94)', fontSize: 16, fontWeight: 900 },
    }] : [],
  })

  return (
    <section className="evidencePanel st03nComponentPanel visual">
      <div className="panelTitleRow">
        <h2>Component Mix</h2>
        <span>Workload type distribution</span>
      </div>
      {rows.length ? <ReactECharts option={option} style={{ height: 330, width: '100%' }} notMerge lazyUpdate /> : <ChartEmptyState />}
    </section>
  )
}

function OffenderRadarGraph({ rows = [] }) {
  const data = graphRows(rows, 4)
  const max = {
    response: metricMax(data, 'response'),
    db: metricMax(data, 'db'),
    wait: metricMax(data, 'wait'),
    cpu: metricMax(data, 'cpu'),
    steps: metricMax(data, 'steps'),
  }
  const normalize = (value, metric) => Math.round((Number(value || 0) / max[metric]) * 100)

  const option = chartBaseOption({
    legend: { bottom: 0, textStyle: chartTextStyle, icon: 'circle' },
    tooltip: {
      ...chartBaseOption().tooltip,
      formatter: ({ data: item }) => {
        const row = item?.row || {}
        return [
          `<b>${row.name}</b>`,
          `${row.kind || 'ST03N'} · ${row.component || 'Workload'}`,
          `Response: <b>${fmt(row.response, 0)}ms</b>`,
          `DB: <b>${fmt(row.db, 0)}ms</b>`,
          `Wait: <b>${fmt(row.wait, 0)}ms</b>`,
          `CPU: <b>${fmt(row.cpu, 0)}ms</b>`,
          `Steps: <b>${fmt(row.steps, 0)}</b>`,
        ].join('<br/>')
      },
    },
    radar: {
      center: ['50%', '45%'],
      radius: '65%',
      splitNumber: 4,
      indicator: [
        { name: 'Response', max: 100 },
        { name: 'DB', max: 100 },
        { name: 'Wait', max: 100 },
        { name: 'CPU', max: 100 },
        { name: 'Steps', max: 100 },
      ],
      axisName: { color: 'rgba(226,232,240,.82)', fontWeight: 800 },
      splitLine: { lineStyle: { color: 'rgba(148,163,184,.18)' } },
      splitArea: { areaStyle: { color: ['rgba(15,23,42,.18)', 'rgba(15,23,42,.32)'] } },
      axisLine: { lineStyle: { color: 'rgba(148,163,184,.24)' } },
    },
    series: [
      {
        name: 'Offender profile',
        type: 'radar',
        symbolSize: 5,
        areaStyle: { opacity: 0.12 },
        lineStyle: { width: 2.4 },
        data: data.map((row) => ({
          name: row.name,
          row,
          value: [
            normalize(row.response, 'response'),
            normalize(row.db, 'db'),
            normalize(row.wait, 'wait'),
            normalize(row.cpu, 'cpu'),
            normalize(row.steps, 'steps'),
          ],
        })),
      },
    ],
  })

  return (
    <section className="evidencePanel visual">
      <div className="panelTitleRow">
        <h2>Offender Profile Radar</h2>
        <span>Normalized metric intensity</span>
      </div>
      {data.length ? <ReactECharts option={option} style={{ height: 340, width: '100%' }} notMerge lazyUpdate /> : <ChartEmptyState />}
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
      <svg viewBox="0 0 360 170" width="100%" height="170" role="img" aria-label={`${title} distribution`}>
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
        <div style={span(12)}><TopOffenderSplitGraph topRows={topRows} /></div>
        <div style={span(8)}><BubbleImpactGraph rows={chartRows} /></div>
        <div style={span(4)}><ComponentDonutGraph analysis={analysis} /></div>
        <div style={span(12)}><OffenderRadarGraph rows={chartRows} /></div>
        <div style={span(12)}><BreakdownPanel rows={chartRows} /></div>
        <div style={span(4)}><SparklinePanel title="Response Distribution" tag="Dialog impact" rows={topResponseRows} metric="response" unit="ms" /></div>
        <div style={span(4)}><SparklinePanel title="DB Time Distribution" tag="Database pressure" rows={topDbRows} metric="db" unit="ms" /></div>
        <div style={span(4)}><SparklinePanel title="Steps Distribution" tag="Execution volume" rows={topStepRows} metric="steps" /></div>
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
