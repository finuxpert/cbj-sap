import React from 'react'
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts'

const METRICS = {
  cpuPct: { label: 'CPU', unit: '%', digits: 1, domain: [0, 100] },
  memoryPct: { label: 'RAM', unit: '%', digits: 1, domain: [0, 100] },
  loadRatio: { label: 'Load', unit: '', digits: 2 },
  swapIn: { label: 'Swap', unit: ' p/s', digits: 0 },
  wpCritical: { label: 'WP Critical', unit: '', digits: 0 },
}

const SERIES_COLORS = ['#32c7cf', '#4d8fff', '#f5a623', '#9b72ff', '#6fd08c', '#f06464']

function fmt(value, digits = 1, unit = '') {
  if (!Number.isFinite(Number(value))) return '—'
  return `${Number(value).toLocaleString('en-US', { maximumFractionDigits: digits })}${unit}`
}

function compactLabel(value = '') {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2})$/)
  return match ? `${match[2]}-${match[3]} ${match[4]}` : value
}

function LandscapeTip({ active, payload, label, metric }) {
  if (!active || !payload?.length || String(label || '').startsWith('__gap-')) return null
  const config = METRICS[metric] || METRICS.cpuPct
  return <div className="rca26Tooltip"><strong>{label}</strong>{[...payload].filter((item) => item.value !== null && item.value !== undefined).sort((a, b) => Number(b.value) - Number(a.value)).map((item) => <span key={item.dataKey}>{item.name} {fmt(item.value, config.digits, config.unit)}</span>)}</div>
}

export default function LogLandscapeCompare({ view, metric = 'memoryPct', onMetricChange, focusTime = '', onFocusTime, onHostDrilldown }) {
  const config = METRICS[metric] || METRICS.memoryPct
  const hosts = view?.hosts || []
  const realTimes = (view?.snapshots || []).map((row) => row.timeLabel)
  const chartTimes = (view?.chartSnapshots || view?.snapshots || []).map((row) => row.chartGap ? row.chartKey : row.timeLabel)
  const rows = React.useMemo(() => {
    const map = new Map(chartTimes.map((chartKey) => [chartKey, { chartKey }]))
    ;(view?.landscapeTelemetry || []).forEach((row) => {
      const key = row.timeLabel
      if (!map.has(key)) return
      map.get(key).timeLabel = row.timeLabel
      map.get(key)[row.host] = Number.isFinite(Number(row[metric])) ? Number(row[metric]) : null
    })
    return Array.from(map.values())
  }, [view?.landscapeTelemetry, metric, chartTimes.join('|')])

  const matrix = React.useMemo(() => {
    const map = new Map()
    ;(view?.landscapeTelemetry || []).forEach((row) => map.set(`${row.host}|${row.timeLabel}`, row))
    return map
  }, [view?.landscapeTelemetry])

  return <section className="rca26Panel rca26LandscapePanel">
    <div className="rca26PanelHead">
      <div><h2>Landscape Compare</h2><p data-pdf-ignore="true">Compare application servers on the same timeline. Large evidence gaps are not connected.</p></div>
      <div className="rca26MetricSwitch" role="group" aria-label="Landscape metric">
        {Object.entries(METRICS).map(([key, item]) => <button type="button" key={key} data-active={metric === key} onClick={() => onMetricChange?.(key)}>{item.label}</button>)}
      </div>
    </div>
    <div className="rca26Chart tall wideChart"><ResponsiveContainer width="100%" height="100%"><LineChart data={rows} onClick={(state) => state?.activeLabel && !String(state.activeLabel).startsWith('__gap-') && onFocusTime?.(state.activeLabel)} margin={{ top: 10, right: 24, left: 0, bottom: rows.length > 12 ? 28 : 8 }}><CartesianGrid strokeDasharray="3 6" vertical={false} /><XAxis dataKey="chartKey" tickFormatter={(value) => String(value).startsWith('__gap-') ? '' : compactLabel(value)} /><YAxis domain={config.domain} tickFormatter={config.unit === '%' ? (value) => `${value}%` : undefined} /><Tooltip content={<LandscapeTip metric={metric} />} /><Legend />{hosts.map((host, index) => <Line key={host} type="linear" dataKey={host} name={host} stroke={SERIES_COLORS[index % SERIES_COLORS.length]} strokeWidth={host === view?.host ? 2.8 : 1.8} dot={false} connectNulls={false} />)}</LineChart></ResponsiveContainer></div>
    <div className="rca26PressureMatrix" data-pdf-ignore="true">
      <div className="rca26PressureRow header" style={{ '--rca-matrix-cols': Math.max(realTimes.length, 1) }}><b>Host</b>{realTimes.map((time) => <span key={time}>{compactLabel(time)}</span>)}</div>
      {hosts.map((host) => <div className="rca26PressureRow" style={{ '--rca-matrix-cols': Math.max(realTimes.length, 1) }} key={host}><button type="button" className="hostLabel" onClick={() => onHostDrilldown?.(host, focusTime || '')}>{host}</button>{realTimes.map((time) => { const row = matrix.get(`${host}|${time}`); const severity = String(row?.severity || 'NONE').toLowerCase(); return <button type="button" key={`${host}-${time}`} className={`pressureCell ${severity}`} title={`${host} · ${time} · ${row?.severity || 'No sample'}`} data-active={focusTime === time} onClick={() => onHostDrilldown?.(host, time)}>{row ? row.severity.slice(0, 1) : '—'}</button> })}</div>)}
    </div>
  </section>
}
