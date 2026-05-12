import React from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LineChart,
  Line,
  LabelList,
} from 'recharts'

function shortLabel(value = '') {
  const text = String(value || '')
  return text.length > 22 ? `${text.slice(0, 20)}…` : text
}

function RankingTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload || {}
  return (
    <div className="evidenceChartTooltip">
      <strong>{row.fullName || label}</strong>
      <span>Problem signal: {row.hits || 0} total hit(s), {row.crit || 0} critical hit(s).</span>
      <small>Why this matters: repeated or critical errors should be investigated first because they are stronger RCA evidence than isolated noise.</small>
    </div>
  )
}

function TimelineTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const hits = payload.find((item) => item.dataKey === 'hits')?.value || 0
  const crit = payload.find((item) => item.dataKey === 'crit')?.value || 0
  return (
    <div className="evidenceChartTooltip">
      <strong>{label}</strong>
      <span>Hits: {hits} · Critical: {crit}</span>
      <small>Use this to confirm whether the error spike aligns with the incident window.</small>
    </div>
  )
}

function IncidentTimelineRail({ timeline = [] }) {
  if (!timeline.length) return null
  const maxHits = Math.max(...timeline.map((item) => Number(item.hits || 0)), 1)
  const topEvents = [...timeline]
    .map((item) => ({
      ...item,
      hits: Number(item.hits || 0),
      crit: Number(item.crit || 0),
      severity: Number(item.crit || 0) > 0 ? 'crit' : Number(item.hits || 0) >= maxHits * 0.7 ? 'warn' : 'info',
    }))
    .sort((a, b) => String(a.time).localeCompare(String(b.time)))
    .slice(-12)

  return (
    <div className="incidentTimelineRail" aria-label="Incident timeline rail">
      {topEvents.map((item) => (
        <div className="incidentRailItem" data-severity={item.severity} key={`${item.time}-${item.hits}-${item.crit}`}>
          <span className="incidentRailMarker" />
          <div>
            <b>{item.time}</b>
            <span>{item.hits} hit(s) · {item.crit} critical</span>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function LogEvidenceCharts({ chartData = [], timeline = [] }) {
  const [expandedRanking, setExpandedRanking] = React.useState(false)
  const rankedAll = [...chartData]
    .map((item) => ({ ...item, fullName: item.fullName || item.name, problemScore: Number(item.crit || 0) * 5 + Number(item.hits || 0) }))
    .sort((a, b) => b.problemScore - a.problemScore || b.hits - a.hits)
  const rankedErrors = rankedAll
    .slice(0, expandedRanking ? 10 : 5)
    .map((item, index) => ({ ...item, rankLabel: `${index + 1}. ${shortLabel(item.fullName || item.name)}` }))

  return (
    <section className="evidencePanel chartPanel rcaReadableChartPanel">
      <div className="chartTitleBlock chartTitleActionBlock">
        <div>
          <h2>Error family ranking</h2>
          <p>Fokus default ke Top 5 supaya mobile tetap readable. Expand hanya saat perlu deep evidence.</p>
        </div>
        {rankedAll.length > 5 ? (
          <button className="btn mini" type="button" onClick={() => setExpandedRanking((value) => !value)}>
            {expandedRanking ? 'Top 5' : 'Show 10'}
          </button>
        ) : null}
      </div>
      <ResponsiveContainer width="100%" height={Math.max(220, rankedErrors.length * 44)}>
        <BarChart data={rankedErrors} layout="vertical" margin={{ top: 8, right: 44, bottom: 8, left: 112 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} label={{ value: 'Problem Score / Count', position: 'insideBottom', offset: -4 }} />
          <YAxis type="category" dataKey="rankLabel" width={112} axisLine={false} tickLine={false} />
          <Tooltip content={<RankingTooltip />} />
          <Legend formatter={(value) => (value === 'hits' ? 'Total Count' : value === 'crit' ? 'Critical Count' : value)} />
          <Bar dataKey="hits" name="Total Count" radius={[0, 8, 8, 0]} barSize={22}>
            <LabelList dataKey="hits" position="right" />
          </Bar>
          <Bar dataKey="crit" name="Critical Count" radius={[0, 8, 8, 0]} barSize={22}>
            <LabelList dataKey="crit" position="right" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {timeline?.length ? (
        <>
          <div className="chartTitleBlock compact">
            <h2>Incident timeline rail</h2>
            <p>Rail ini menandai evolution incident: CRIT marker, spike window, dan bucket waktu yang harus divalidasi.</p>
          </div>
          <IncidentTimelineRail timeline={timeline} />
          <details className="chartDetailDisclosure">
            <summary>Show timeline chart</summary>
            <ResponsiveContainer width="100%" height={190}>
              <LineChart data={timeline} margin={{ top: 12, right: 24, bottom: 8, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="time" tickMargin={8} />
                <YAxis allowDecimals={false} />
                <Tooltip content={<TimelineTooltip />} />
                <Legend formatter={(value) => (value === 'hits' ? 'Total Count' : value === 'crit' ? 'Critical Count' : value)} />
                <Line type="monotone" dataKey="hits" name="Total Count" strokeWidth={3} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="crit" name="Critical Count" strokeWidth={3} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </details>
        </>
      ) : null}
    </section>
  )
}
