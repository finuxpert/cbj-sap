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
} from 'recharts'

const CHART = {
  hits: '#38bdf8',
  crit: '#f97316',
  warn: '#facc15',
  cpu: '#a78bfa',
  memory: '#2dd4bf',
  state: '#22c55e',
  grid: 'rgba(148, 163, 184, 0.18)',
  axis: 'rgba(203, 213, 225, 0.78)',
}

function safe(value) {
  return String(value ?? '').trim()
}

function addMetric(map, key, values = {}) {
  const name = safe(key) || 'UNKNOWN'
  const current = map.get(name) || { name, hits: 0, crit: 0, warn: 0, cpuTotal: 0, cpuMax: 0, rssTotal: 0, rssMax: 0 }
  current.hits += values.hits || 0
  current.crit += values.crit || 0
  current.warn += values.warn || 0
  current.cpuTotal += values.cpu || 0
  current.cpuMax = Math.max(current.cpuMax, values.cpu || 0)
  current.rssTotal += values.rssGb || 0
  current.rssMax = Math.max(current.rssMax, values.rssGb || 0)
  map.set(name, current)
}

function byKey(rows = [], key) {
  const map = new Map()
  rows.forEach((row) => {
    addMetric(map, row[key], {
      hits: 1,
      crit: row.className === 'CRIT' ? 1 : 0,
      warn: row.className === 'WARN' ? 1 : 0,
      cpu: Number(row.cpu) || 0,
      rssGb: Number(row.rssGb) || 0,
    })
  })
  return Array.from(map.values())
    .map((item) => ({
      ...item,
      avgCpu: item.hits ? Number((item.cpuTotal / item.hits).toFixed(2)) : 0,
      avgRssGb: item.hits ? Number((item.rssTotal / item.hits).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.crit - a.crit || b.hits - a.hits)
}

function infraTimeline(rows = []) {
  const map = new Map()
  rows.forEach((row) => {
    const time = safe(row.timeLabel)
    if (!time) return
    const current = map.get(time) || { time, hits: 0, crit: 0, warn: 0, cpuTotal: 0, cpuMax: 0, rssTotal: 0, rssMax: 0 }
    current.hits += 1
    current.crit += row.className === 'CRIT' ? 1 : 0
    current.warn += row.className === 'WARN' ? 1 : 0
    const cpu = Number(row.cpu) || 0
    const rssGb = Number(row.rssGb) || 0
    current.cpuTotal += cpu
    current.cpuMax = Math.max(current.cpuMax, cpu)
    current.rssTotal += rssGb
    current.rssMax = Math.max(current.rssMax, rssGb)
    map.set(time, current)
  })
  return Array.from(map.values())
    .map((item) => ({
      ...item,
      avgCpu: item.hits ? Number((item.cpuTotal / item.hits).toFixed(2)) : 0,
      avgRssGb: item.hits ? Number((item.rssTotal / item.hits).toFixed(2)) : 0,
    }))
    .sort((a, b) => String(a.time).localeCompare(String(b.time)))
}

function ChartPanel({ title, tag, children }) {
  return (
    <section className="evidencePanel infraChartPanel">
      <div className="panelTitleRow">
        <h2>{title}</h2>
        <span>{tag}</span>
      </div>
      {children}
    </section>
  )
}

function axisProps() {
  return { tick: { fill: CHART.axis, fontSize: 11 }, tickLine: false, axisLine: false }
}

export default function LogInfraCharts({ rows = [] }) {
  const timeline = infraTimeline(rows)
  const hostData = byKey(rows, 'host').slice(0, 6)
  const wpTypeData = byKey(rows, 'type').slice(0, 6)
  const stateData = byKey(rows, 'state').slice(0, 6)
  const cpuProgramData = byKey(rows, 'program').slice(0, 6).map((item) => ({ ...item, name: item.name.slice(0, 28) }))

  if (!rows.length) return null

  return (
    <div className="infraChartsBlock">
      <div className="panelTitleRow infraBlockTitle">
        <h2>Infra Pressure View</h2>
        <span>CPU / Memory / WP State</span>
      </div>

      <div className="evidenceGrid wide infraWideGrid">
        <ChartPanel title="CPU and Memory Timeline" tag="Avg and max pressure">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={timeline} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="time" {...axisProps()} />
              <YAxis {...axisProps()} />
              <Tooltip />
              <Legend />
              <Line dataKey="avgCpu" name="Avg CPU %" stroke={CHART.cpu} strokeWidth={3} dot={{ r: 3 }} />
              <Line dataKey="cpuMax" name="Max CPU %" stroke={CHART.crit} strokeWidth={3} dot={{ r: 3 }} />
              <Line dataKey="avgRssGb" name="Avg RSS GB" stroke={CHART.memory} strokeWidth={3} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Host Infra Signal" tag="By host">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart layout="vertical" data={hostData} margin={{ top: 8, right: 20, left: 8, bottom: 4 }}>
              <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" {...axisProps()} />
              <YAxis type="category" dataKey="name" width={120} {...axisProps()} />
              <Tooltip />
              <Legend />
              <Bar dataKey="hits" name="Hits" fill={CHART.hits} radius={[0, 8, 8, 0]} />
              <Bar dataKey="crit" name="CRIT" fill={CHART.crit} radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>

      <div className="evidenceGrid triple infraTripleGrid">
        <ChartPanel title="WP Type Distribution" tag="Dialog / BTC / UPD">
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={wpTypeData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" {...axisProps()} />
              <YAxis {...axisProps()} />
              <Tooltip />
              <Legend />
              <Bar dataKey="hits" name="Hits" fill={CHART.hits} radius={[8, 8, 0, 0]} />
              <Bar dataKey="crit" name="CRIT" fill={CHART.crit} radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="WP State Mix" tag="Running / stopped">
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={stateData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" {...axisProps()} />
              <YAxis {...axisProps()} />
              <Tooltip />
              <Legend />
              <Bar dataKey="hits" name="Hits" fill={CHART.state} radius={[8, 8, 0, 0]} />
              <Bar dataKey="crit" name="CRIT" fill={CHART.crit} radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Program CPU Pressure" tag="Top avg CPU">
          <ResponsiveContainer width="100%" height={230}>
            <BarChart layout="vertical" data={cpuProgramData} margin={{ top: 8, right: 12, left: 8, bottom: 4 }}>
              <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" {...axisProps()} />
              <YAxis type="category" dataKey="name" width={126} {...axisProps()} />
              <Tooltip />
              <Legend />
              <Bar dataKey="avgCpu" name="Avg CPU %" fill={CHART.cpu} radius={[0, 8, 8, 0]} />
              <Bar dataKey="crit" name="CRIT" fill={CHART.crit} radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>
    </div>
  )
}
