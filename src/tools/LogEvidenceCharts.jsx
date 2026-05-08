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

export default function LogEvidenceCharts({ chartData = [], timeline = [] }) {
  const rankedErrors = [...chartData]
    .map((item) => ({ ...item, fullName: item.fullName || item.name, problemScore: Number(item.crit || 0) * 5 + Number(item.hits || 0) }))
    .sort((a, b) => b.problemScore - a.problemScore || b.hits - a.hits)
    .slice(0, 10)
    .map((item, index) => ({ ...item, rankLabel: `${index + 1}. ${shortLabel(item.fullName || item.name)}` }))

  return (
    <section className="evidencePanel chartPanel rcaReadableChartPanel">
      <div className="chartTitleBlock">
        <h2>Error family ranking</h2>
        <p>Yang paling problem adalah bar paling atas: dihitung dari critical hit + total occurrence.</p>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(280, rankedErrors.length * 42)}>
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
            <h2>Error timeline</h2>
            <p>Pakai grafik ini untuk melihat jam spike error, bukan ranking problem.</p>
          </div>
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
        </>
      ) : null}
    </section>
  )
}
