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
    .map(([name, value]) => ({ name: String(name).slice(0, 24), fullName: String(name), value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
}

function shortLabel(value, max = 24) {
  const text = String(value || 'Unknown')
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function normalizeRows(rows = [], limit = 10) {
  return list(rows)
    .map((item) => {
      const fullName = String(item?.name || item?.label || 'Unknown')
      return {
        ...item,
        name: shortLabel(fullName, 28),
        fullName,
        value: Number(item?.value ?? item?.hits ?? item?.count ?? 0) || 0,
      }
    })
    .filter((item) => item.value > 0 || item.hits > 0 || item.crit > 0 || item.warn > 0)
    .slice(0, limit)
}

function normalizeTimeline(rows = []) {
  return list(rows).map((item) => ({
    name: String(item?.name || item?.time || item?.timeLabel || '').slice(0, 32) || 'T',
    hits: Number(item?.hits || 0) || 0,
    crit: Number(item?.crit || 0) || 0,
    warn: Number(item?.warn || 0) || 0,
  })).slice(-20)
}

function normalizeResourceRows(rows = []) {
  return list(rows).map((item, index) => ({
    name: String(item?.name || item?.time || item?.label || `T${index + 1}`).slice(0, 32),
    cpu: Number(item?.cpu ?? item?.cpu_pct ?? item?.cpu_percent ?? 0) || 0,
    mem: Number(item?.mem ?? item?.memory ?? item?.memory_pct ?? item?.mem_percent ?? 0) || 0,
    swap: Number(item?.swap ?? item?.swap_pct ?? item?.swap_percent ?? 0) || 0,
  })).filter((item) => item.cpu > 0 || item.mem > 0 || item.swap > 0).slice(-30)
}

function buildFallbackRows(caseData) {
  const severity = new Map()
  const tools = new Map()
  const anomaly = new Map()
  const jobs = new Map()
  const programs = new Map()
  const timeline = new Map()
  const confidence = []
  const resources = []

  list(caseData?.parsed_results).forEach((item, index) => {
    const raw = item?.result_json || {}
    add(severity, item?.severity || raw?.severity || 'INFO')
    add(tools, item?.tool || raw?.tool || 'Parsed Result')
    add(anomaly, item?.top_anomaly || item?.verdict || raw?.primary?.name || 'Unknown')

    const conf = Number(item?.confidence ?? raw?.confidence ?? 0)
    if (Number.isFinite(conf) && conf > 0) {
      confidence.push({ name: String(item?.tool || `Result ${index + 1}`).slice(0, 18), fullName: String(item?.tool || `Result ${index + 1}`), value: conf })
    }

    list(raw?.timeline).forEach((row) => {
      const label = row?.time || row?.timeLabel || row?.created_at || `T${index + 1}`
      const current = timeline.get(label) || { name: String(label).slice(0, 16), hits: 0, crit: 0, warn: 0 }
      current.hits += Number(row?.hits || row?.crit || row?.warn || 0) || 0
      current.crit += Number(row?.crit || 0) || 0
      current.warn += Number(row?.warn || 0) || 0
      timeline.set(label, current)
    })

    resources.push(...normalizeResourceRows(raw?.system_resources || raw?.resources || raw?.cpu_mem_swap || raw?.host_metrics || []))

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
    resources: resources.slice(-30),
    summary: null,
    source: 'frontend-fallback',
  }
}

function buildRows(caseData) {
  const analytics = caseData?.analytics || {}
  if (analytics?.has_data) {
    return {
      severity: normalizeRows(analytics.severity, 4),
      tools: normalizeRows(analytics.tools || analytics.evidence_sources, 8),
      anomaly: normalizeRows(analytics.anomalies, 10),
      jobs: normalizeRows(analytics.jobs, 10),
      programs: normalizeRows(analytics.programs, 10),
      confidence: normalizeRows(analytics.confidence, 10),
      timeline: normalizeTimeline(analytics.timeline),
      resources: normalizeResourceRows(analytics.system_resources || analytics.resources || analytics.cpu_mem_swap || []),
      summary: analytics.summary || null,
      source: 'backend',
    }
  }
  return buildFallbackRows(caseData)
}

function Insight({ label, value, hint }) {
  return (
    <div className="caseAnalyticsInsight">
      <span>{label}</span>
      <strong title={value || ''}>{value || '-'}</strong>
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

function BarCard({ title, data, hint = 'Parsed evidence distribution', horizontal = false }) {
  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0)
  const top = data[0]
  const height = horizontal ? Math.max(260, data.length * 34 + 80) : 240
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
      <div className={`caseDetailChartBox ${horizontal ? 'caseDetailChartBox--horizontal' : ''}`}>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={horizontal ? { top: 8, right: 18, left: 118, bottom: 8 } : { top: 8, right: 14, left: -18, bottom: 18 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={!horizontal} vertical={horizontal} />
            {horizontal ? (
              <>
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={126} />
              </>
            ) : (
              <>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-12} textAnchor="end" height={52} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              </>
            )}
            <Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || payload?.[0]?.payload?.name || ''} />
            <Bar dataKey="value" radius={horizontal ? [0, 8, 8, 0] : [8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="caseAnalyticsChartNote">Top signal: <b title={top.fullName || top.name}>{top.fullName || top.name}</b> · {top.value}</p>
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
            <Line type="monotone" dataKey="hits" stroke="#2dd4bf" strokeWidth={3} dot={false} />
            <Line type="monotone" dataKey="crit" stroke="#f87171" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="warn" stroke="#f59e0b" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function ResourceChart({ data }) {
  if (!data.length) return <EmptyChart title="CPU / Memory / Swap" hint="Host resource utilization over time" />

  return (
    <section className="caseDetailAnalyticsWide caseResourcePanel">
      <div className="caseAnalyticsChartHead">
        <div>
          <h3>CPU / Memory / Swap</h3>
          <span>Host resource utilization over time</span>
        </div>
        <b>{data.length}</b>
      </div>
      <div className="caseResourceLegend">
        <span className="isCpu">CPU %</span>
        <span className="isMem">Memory %</span>
        <span className="isSwap">Swap %</span>
      </div>
      <div className="caseDetailChartBox">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 8, right: 14, left: -18, bottom: 18 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
            <Tooltip formatter={(value, name) => [`${value}%`, name]} />
            <Line type="monotone" dataKey="cpu" name="CPU" stroke="#38bdf8" strokeWidth={3} dot={false} />
            <Line type="monotone" dataKey="mem" name="Memory" stroke="#2dd4bf" strokeWidth={3} dot={false} />
            <Line type="monotone" dataKey="swap" name="Swap" stroke="#f59e0b" strokeWidth={3} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function ConfidenceCard({ data }) {
  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0)
  if (!data.length) return <EmptyChart title="Parsed Confidence" hint="Confidence per parser result" />

  return (
    <section className="caseDetailAnalyticsWide caseConfidencePanel">
      <div className="caseAnalyticsChartHead">
        <div>
          <h3>Parsed Confidence</h3>
          <span>Confidence per parser result</span>
        </div>
        <b>{Math.round(total / data.length)}%</b>
      </div>
      <div className="caseConfidenceRows">
        {data.map((item, index) => {
          const value = Math.max(0, Math.min(100, Number(item.value || 0)))
          return (
            <div className="caseConfidenceRow" key={`${item.fullName || item.name}-${index}`}>
              <div className="caseConfidenceMeta">
                <strong title={item.fullName || item.name}>{item.fullName || item.name}</strong>
                <span>{value}%</span>
              </div>
              <div className="caseConfidenceTrack"><i style={{ width: `${value}%` }} /></div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default function CaseAnalytics({ caseData }) {
  const rows = React.useMemo(() => buildRows(caseData), [caseData])
  const hasData = Object.values(rows).some((row) => Array.isArray(row) && row.length > 0)
  const topSignal = rows.summary?.top_signal || rows.anomaly[0]?.fullName || rows.anomaly[0]?.name || caseData?.top_anomaly || 'Pending'
  const topTool = rows.summary?.dominant_source || rows.tools[0]?.fullName || rows.tools[0]?.name || caseData?.tool || 'Unknown'
  const avgConfidence = rows.summary?.avg_confidence || (rows.confidence.length
    ? Math.round(rows.confidence.reduce((sum, item) => sum + Number(item.value || 0), 0) / rows.confidence.length)
    : 0)

  return (
    <article className="caseDetailPanel caseDetailAnalyticsPanel" data-analytics-source={rows.source}>
      <div className="caseDetailSectionHead caseAnalyticsHeader">
        <div>
          <p className="sectionKicker">RCA Evidence Analytics</p>
          <span>{rows.source === 'backend' ? 'Backend-generated analytics from Case History API.' : 'Fallback analytics generated from parsed results in browser.'}</span>
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
          <ResourceChart data={rows.resources} />
          <SeverityCard data={rows.severity} />
          <BarCard title="Tool / Evidence Source" data={rows.tools} hint="Source coverage by tool" horizontal />
          <BarCard title="Top Error / Anomaly" data={rows.anomaly} hint="Most repeated RCA signals" horizontal />
          <BarCard title="Top JobName" data={rows.jobs} hint="Impacted job names" horizontal />
          <BarCard title="Top Program" data={rows.programs} hint="Impacted SAP programs" horizontal />
          <ConfidenceCard data={rows.confidence} />
        </div>
      )}
    </article>
  )
}
