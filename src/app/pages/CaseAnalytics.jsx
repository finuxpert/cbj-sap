import React from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import '../case-detail-analytics.css'

const list = (value) => Array.isArray(value) ? value : []

function add(map, key, value = 1) {
  const label = key || 'Unknown'
  map.set(label, (map.get(label) || 0) + value)
}

function rowsFromMap(map, limit = 8) {
  return Array.from(map.entries())
    .map(([name, value]) => ({ name: String(name).slice(0, 24), value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
}

function buildRows(caseData) {
  const severity = new Map()
  const tools = new Map()
  const anomaly = new Map()
  const jobs = new Map()
  const programs = new Map()
  const timeline = new Map()
  const confidence = []

  list(caseData?.parsed_results).forEach((item, index) => {
    const raw = item?.result_json || {}
    add(severity, item?.severity || raw?.severity || 'INFO')
    add(tools, item?.tool || raw?.tool || 'Parsed Result')
    add(anomaly, item?.top_anomaly || item?.verdict || raw?.primary?.name || 'Unknown')

    const conf = Number(item?.confidence ?? raw?.confidence ?? 0)
    if (Number.isFinite(conf) && conf > 0) {
      confidence.push({ name: String(item?.tool || `Result ${index + 1}`).slice(0, 18), value: conf })
    }

    list(raw?.timeline).forEach((row) => {
      const label = row?.time || row?.timeLabel || row?.created_at || `T${index + 1}`
      const current = timeline.get(label) || { name: String(label).slice(0, 16), hits: 0, crit: 0, warn: 0 }
      current.hits += Number(row?.hits || row?.crit || row?.warn || 0) || 0
      current.crit += Number(row?.crit || 0) || 0
      current.warn += Number(row?.warn || 0) || 0
      timeline.set(label, current)
    })

    list(raw?.errorGroups).forEach((row) => add(anomaly, row?.name || row?.errorCode, Number(row?.hits || 1) || 1))
    list(raw?.jobGroups).forEach((row) => add(jobs, row?.name || row?.jobName, Number(row?.hits || 1) || 1))
    list(raw?.programGroups).forEach((row) => add(programs, row?.name || row?.program, Number(row?.hits || 1) || 1))
  })

  list(caseData?.evidence).forEach((item) => add(tools, item?.tool || 'Evidence'))

  return {
    severity: rowsFromMap(severity, 4),
    tools: rowsFromMap(tools),
    anomaly: rowsFromMap(anomaly),
    jobs: rowsFromMap(jobs),
    programs: rowsFromMap(programs),
    confidence: confidence.slice(-8),
    timeline: Array.from(timeline.values()).slice(-14),
  }
}

function Insight({ label, value, hint }) {
  return (
    <div className="caseAnalyticsInsight">
      <span>{label}</span>
      <strong>{value || '-'}</strong>
      <small>{hint}</small>
    </div>
  )
}

function EmptyChart({ title, hint }) {
  return (
    <section>
      <div className="caseAnalyticsChartHead">
        <div>
          <h3>{title}</h3>
          <span>{hint}</span>
        </div>
      </div>
      <div className="caseDetailChartEmpty">No chart data yet.</div>
    </section>
  )
}

function BarCard({ title, data, hint = 'Parsed evidence distribution' }) {
  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0)
  const top = data[0]
  if (!data.length) return <EmptyChart title={title} hint={hint} />

  return (
    <section>
      <div className="caseAnalyticsChartHead">
        <div>
          <h3>{title}</h3>
          <span>{hint}</span>
        </div>
        <b>{total}</b>
      </div>
      <div className="caseDetailChartBox">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 8, right: 14, left: -18, bottom: 18 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-12} textAnchor="end" height={52} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="value" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="caseAnalyticsChartNote">Top signal: <b>{top.name}</b> · {top.value}</p>
    </section>
  )
}

function SeverityCard({ data }) {
  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0)
  if (!data.length) return <EmptyChart title="Severity Split" hint="INFO/WARN/CRIT result spread" />

  return (
    <section>
      <div className="caseAnalyticsChartHead">
        <div>
          <h3>Severity Split</h3>
          <span>INFO/WARN/CRIT result spread</span>
        </div>
        <b>{total}</b>
      </div>
      <div className="caseDetailChartBox caseDetailChartBox--donut">
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Tooltip />
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={4} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <p className="caseAnalyticsChartNote">Dominant severity: <b>{data[0]?.name}</b> · {data[0]?.value}</p>
    </section>
  )
}

function TimelineCard({ data }) {
  if (!data.length) return <EmptyChart title="Timeline Signal" hint="Parsed hits over time" />

  return (
    <section className="caseDetailAnalyticsWide">
      <div className="caseAnalyticsChartHead">
        <div>
          <h3>Timeline Signal</h3>
          <span>Parsed hits over time</span>
        </div>
        <b>{data.length}</b>
      </div>
      <div className="caseDetailChartBox">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 8, right: 14, left: -18, bottom: 18 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip />
            <Line type="monotone" dataKey="hits" strokeWidth={3} dot={false} />
            <Line type="monotone" dataKey="crit" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="warn" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

export default function CaseAnalytics({ caseData }) {
  const rows = React.useMemo(() => buildRows(caseData), [caseData])
  const hasData = Object.values(rows).some((row) => row.length > 0)
  const topSignal = rows.anomaly[0]?.name || caseData?.top_anomaly || 'Pending'
  const topTool = rows.tools[0]?.name || caseData?.tool || 'Unknown'
  const avgConfidence = rows.confidence.length
    ? Math.round(rows.confidence.reduce((sum, item) => sum + Number(item.value || 0), 0) / rows.confidence.length)
    : 0

  return (
    <article className="caseDetailPanel caseDetailAnalyticsPanel">
      <div className="caseDetailSectionHead caseAnalyticsHeader">
        <div>
          <p className="sectionKicker">RCA Evidence Analytics</p>
          <span>Auto-generated from parsed results and linked evidence.</span>
        </div>
      </div>

      <div className="caseAnalyticsInsights">
        <Insight label="Top Signal" value={topSignal} hint="Highest parsed anomaly" />
        <Insight label="Dominant Source" value={topTool} hint="Most frequent tool/evidence source" />
        <Insight label="Avg Confidence" value={avgConfidence ? `${avgConfidence}%` : '-'} hint="Based on parsed result confidence" />
      </div>

      {!hasData ? (
        <div className="caseDetailChartEmpty">No parsed analytics found for this case yet.</div>
      ) : (
        <div className="caseDetailAnalyticsGrid">
          <TimelineCard data={rows.timeline} />
          <SeverityCard data={rows.severity} />
          <BarCard title="Tool / Evidence Source" data={rows.tools} hint="Source coverage by tool" />
          <BarCard title="Top Error / Anomaly" data={rows.anomaly} hint="Most repeated RCA signals" />
          <BarCard title="Top JobName" data={rows.jobs} hint="Impacted job names" />
          <BarCard title="Top Program" data={rows.programs} hint="Impacted SAP programs" />
          <section className="caseDetailAnalyticsWide">
            <BarCard title="Parsed Confidence" data={rows.confidence} hint="Confidence per parser result" />
          </section>
        </div>
      )}
    </article>
  )
}
