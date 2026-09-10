import React from 'react'
import * as echarts from './logEcharts.js'
import { SAP_INFRA_TERMS as TERMS } from './sapInfraTerms.js'
import './RundeckMonitoringHistory.css'

const API = `${import.meta.env.BASE_URL}api`

const RANGES = [
  ['6h', '6H'],
  ['24h', '24H'],
  ['7d', '7D'],
  ['30d', '30D'],
  ['90d', '90D'],
]

const BUCKETS = [
  ['auto', 'Auto'],
  ['10m', '10m'],
  ['1h', '1H'],
  ['6h', '6H'],
  ['1d', '1D'],
]

const METRICS = [
  ['cpu', 'CPU'],
  ['ram', 'Memory'],
  ['load', 'Load 1M'],
  ['iowait', 'I/O Wait'],
  ['swap', 'Swap I/O'],
  ['wp', 'Critical WP'],
]

const RANGE_HOURS = { '6h': 6, '24h': 24, '7d': 168, '30d': 720, '90d': 2160 }
const EXPECTED_HOSTS = 5

const number = (value, digits = 1) => {
  if (value === null || value === undefined || value === '') return '—'
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—'
}

const shortHost = (host = '') => {
  const match = String(host).match(/APP(\d+)/i)
  return match ? `APP${match[1]}` : String(host)
}

const formatWib = (value, compact = false) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('id-ID', compact
    ? { timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }
    : { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }
  ).format(date)
}

const themeToken = (name, fallback) => {
  if (typeof window === 'undefined') return fallback
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

const chartTheme = () => ({
  text: themeToken('--sphere-text', '#edf1f4'),
  secondary: themeToken('--sphere-text-secondary', '#b1bbc4'),
  muted: themeToken('--sphere-text-muted', '#7f8c97'),
  border: themeToken('--sphere-border', '#323d48'),
  grid: themeToken('--sphere-border-subtle', '#28323c'),
  panel: themeToken('--sphere-surface-1', '#192129'),
  panelStrong: themeToken('--sphere-surface-2', '#1e2730'),
  accentSoft: themeToken('--sphere-accent-soft', '#17383f'),
  warning: themeToken('--sphere-warning', '#e8c86b'),
  danger: themeToken('--sphere-danger', '#ef8a94'),
})

async function json(url, signal) {
  const response = await fetch(url, { cache: 'no-store', signal })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed (${response.status})`)
  }
  return response.json()
}

function useEChart(option, onClick) {
  const ref = React.useRef(null)
  React.useEffect(() => {
    if (!ref.current) return undefined
    const chart = echarts.init(ref.current, null, { renderer: 'canvas' })
    chart.setOption(option, true)
    const click = (params) => onClick?.(params)
    chart.on('click', click)
    const resize = () => chart.resize()
    window.addEventListener('resize', resize)
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    observer?.observe(ref.current)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', resize)
      chart.off('click', click)
      chart.dispose()
    }
  }, [option, onClick])
  return ref
}

function TrendChart({ trend, mode, range, onSelect }) {
  const option = React.useMemo(() => {
    const palette = chartTheme()
    const rows = trend?.items || []
    const hosts = Array.from(new Set(rows.map((row) => row.host))).sort()
    const byHost = new Map(hosts.map((host) => [host, rows.filter((row) => row.host === host)]))
    const suffix = trend?.unit ? ` ${trend.unit}` : ''
    const valueKey = mode === 'max' ? 'max_value' : 'avg_value'
    const thresholdLines = []

    if (trend?.warning !== null && trend?.warning !== undefined) {
      thresholdLines.push({
        yAxis: Number(trend.warning),
        name: 'WARNING',
        lineStyle: { color: palette.warning, type: 'dashed' },
        label: { formatter: `WARNING ${trend.warning}${suffix}`, color: palette.warning },
      })
    }
    if (trend?.critical !== null && trend?.critical !== undefined) {
      thresholdLines.push({
        yAxis: Number(trend.critical),
        name: 'CRITICAL',
        lineStyle: { color: palette.danger, type: 'dashed' },
        label: { formatter: `CRITICAL ${trend.critical}${suffix}`, color: palette.danger },
      })
    }

    return {
      animationDuration: 180,
      backgroundColor: 'transparent',
      textStyle: { color: palette.text },
      legend: {
        top: 0,
        type: 'scroll',
        data: hosts.map(shortHost),
        textStyle: { color: palette.secondary },
        pageTextStyle: { color: palette.muted },
      },
      grid: { left: 62, right: 28, top: 46, bottom: 68 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', lineStyle: { color: palette.muted } },
        backgroundColor: palette.panelStrong,
        borderColor: palette.border,
        textStyle: { color: palette.text },
        formatter: (items = []) => {
          if (!items.length) return ''
          const first = items[0]?.data || {}
          const title = `<b>${formatWib(first.bucket || first.value?.[0])} WIB</b>`
          const body = items.map((item) => {
            const row = item.data || {}
            const avg = number(row.avg, trend?.metric === 'wp' ? 2 : 1)
            const peak = number(row.max, trend?.metric === 'wp' ? 0 : 1)
            return `${item.marker}${item.seriesName}: <b>${mode === 'max' ? peak : avg}${suffix}</b><br/><span style="opacity:.68">AVG ${avg}${suffix} · PEAK ${peak}${suffix}</span>`
          }).join('<br/>')
          return `${title}<br/>${body}<br/><span style="opacity:.62">Select a point for Historical RCA.</span>`
        },
      },
      xAxis: {
        type: 'time',
        axisLabel: {
          color: palette.muted,
          hideOverlap: true,
          formatter: (value) => {
            const date = new Date(value)
            if (range === '6h' || range === '24h') {
              return new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
            }
            return new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', hour: '2-digit', hour12: false }).format(date)
          },
        },
        axisLine: { lineStyle: { color: palette.border } },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        name: `${trend?.metric_label || ''}${trend?.unit ? ` (${trend.unit})` : ''}`,
        nameTextStyle: { color: palette.muted },
        axisLabel: { color: palette.muted, formatter: (value) => `${value}${trend?.unit === '%' ? '%' : ''}` },
        axisLine: { lineStyle: { color: palette.border } },
        splitLine: { lineStyle: { color: palette.grid, type: 'dashed' } },
        min: trend?.unit === '%' ? 0 : undefined,
        max: trend?.unit === '%' ? 100 : undefined,
      },
      dataZoom: [
        { type: 'inside', filterMode: 'none' },
        {
          type: 'slider',
          bottom: 14,
          height: 16,
          filterMode: 'none',
          borderColor: palette.border,
          backgroundColor: palette.panel,
          fillerColor: palette.accentSoft,
          textStyle: { color: palette.muted },
        },
      ],
      series: hosts.map((host, index) => ({
        name: shortHost(host),
        type: 'line',
        connectNulls: false,
        showSymbol: (byHost.get(host)?.length || 0) <= 80,
        symbolSize: 6,
        emphasis: { focus: 'series' },
        data: (byHost.get(host) || []).map((row) => ({
          value: [row.bucket, row[valueKey]],
          bucket: row.bucket,
          peakAt: row.peak_at,
          peakCollectionId: row.peak_collection_id,
          host: row.host,
          avg: row.avg_value,
          max: row.max_value,
          samples: row.samples,
        })),
        markLine: index === 0 && thresholdLines.length ? {
          silent: true,
          symbol: ['none', 'none'],
          lineStyle: { type: 'dashed', width: 1.1 },
          label: { position: 'insideEndTop', fontSize: 9 },
          data: thresholdLines,
        } : undefined,
      })),
    }
  }, [mode, range, trend])

  const click = React.useCallback((params) => {
    if (params?.componentType !== 'series' || !params?.data) return
    onSelect?.({
      host: params.data.host,
      at: params.data.peakAt || params.data.bucket,
      collectionId: params.data.peakCollectionId || '',
      bucket: params.data.bucket,
      avg: params.data.avg,
      max: params.data.max,
      value: mode === 'max' ? params.data.max : params.data.avg,
      mode,
      metricLabel: trend?.metric_label || '',
      unit: trend?.unit || '',
    })
  }, [mode, onSelect, trend?.metric_label, trend?.unit])

  const ref = useEChart(option, click)
  return <div ref={ref} className="rundeckTrendChart" role="img" aria-label={`${trend?.metric_label || 'Metric'} historical trend for application servers`} />
}

function Segmented({ options, value, onChange, ariaLabel }) {
  return <div className="rundeckSegmented" role="group" aria-label={ariaLabel}>
    {options.map(([key, label]) => (
      <button
        key={key}
        type="button"
        className={value === key ? 'is-active' : ''}
        aria-pressed={value === key}
        onClick={() => onChange(key)}
      >
        {label}
      </button>
    ))}
  </div>
}

function InlineStatus({ value = 'UNKNOWN' }) {
  return <span className={`rundeckInlineStatus is-${String(value).toLowerCase()}`}>{value}</span>
}

function HistoricalRca({ selected, data, loading, error }) {
  if (!selected && !loading && !error) {
    return <div className="rundeckRcaHint">Select a trend point to inspect the exact collection and primary SAP workload candidate.</div>
  }

  const rows = data?.items || []
  const selectedRow = rows.find((row) => row.host === selected?.host) || rows[0] || null
  const consumer = selectedRow?.top_consumers?.[0] || null
  const details = consumer?.details || {}

  return <section className="rundeckRcaSection">
    <div className="rundeckRcaHeader">
      <div>
        <span>{TERMS.historicalRca}</span>
        <h4>{selected?.host ? shortHost(selected.host) : 'Selected sample'}</h4>
        <small>{selected?.at ? `${formatWib(selected.at)} WIB` : 'Loading selected sample'}</small>
      </div>
      {selectedRow && <InlineStatus value={selectedRow.health} />}
    </div>

    {loading && <div className="rundeckHistoryState">Loading RCA correlation…</div>}
    {error && <div className="rundeckHistoryState is-error">{error}</div>}

    {!loading && !error && selectedRow && <>
      <div className="rundeckRcaMetricStrip">
        <span><b>{selected?.metricLabel || 'Selected Metric'}</b>{number(selected?.value)}{selected?.unit ? ` ${selected.unit}` : ''}</span>
        <span><b>CPU</b>{number(selectedRow.cpu_pct)}%</span>
        <span><b>Memory</b>{number(selectedRow.ram_pct)}%</span>
        <span><b>I/O Wait</b>{number(selectedRow.io_wait_pct)}%</span>
        <span><b>Critical WP</b>{number(selectedRow.wp_critical, 0)}</span>
      </div>

      <div className="rundeckRcaWorkload">
        <div className="rundeckRcaWorkloadTitle">
          <span>Primary {TERMS.sapWorkload} Candidate</span>
          <strong title={consumer?.consumer_key || ''}>{consumer?.consumer_key || 'No workload projection available'}</strong>
          {consumer && <small>CPU {number(consumer.cpu_pct)}% · Memory {number(consumer.ram_pct)}%</small>}
        </div>
        <dl>
          <div><dt>{TERMS.backgroundJob}</dt><dd>{details.job_name || '—'}</dd></div>
          <div><dt>{TERMS.abapProgram}</dt><dd>{details.program || '—'}</dd></div>
          <div><dt>{TERMS.workProcess}</dt><dd>{[details.wp_type, details.wp].filter(Boolean).join(' ') || '—'}</dd></div>
          <div><dt>{TERMS.sapUser}</dt><dd>{details.user || '—'}</dd></div>
          <div><dt>{TERMS.osPid}</dt><dd>{details.pid || '—'}</dd></div>
        </dl>
      </div>

      {rows.length > 1 && <details className="rundeckRcaContext">
        <summary>Application Server Context</summary>
        <div className="rundeckMiniTableWrap">
          <table>
            <thead><tr><th>Server</th><th>State</th><th>CPU</th><th>Memory</th><th>I/O Wait</th><th>Critical WP</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={`${row.collection_id}-${row.host}`} className={row.host === selected?.host ? 'is-selected' : ''}>
              <td>{shortHost(row.host)}</td>
              <td><InlineStatus value={row.health} /></td>
              <td>{number(row.cpu_pct)}%</td>
              <td>{number(row.ram_pct)}%</td>
              <td>{number(row.io_wait_pct)}%</td>
              <td>{number(row.wp_critical, 0)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>}
    </>}

    {!loading && !error && data && !selectedRow && <div className="rundeckHistoryState">No snapshot found for the selected collection.</div>}
  </section>
}

export default function RundeckMonitoringHistory({ refreshToken = '', databaseEnabled = false }) {
  const [range, setRange] = React.useState('24h')
  const [bucket, setBucket] = React.useState('auto')
  const [metric, setMetric] = React.useState('cpu')
  const [mode, setMode] = React.useState('max')
  const [trend, setTrend] = React.useState(null)
  const [trendLoading, setTrendLoading] = React.useState(false)
  const [trendError, setTrendError] = React.useState('')
  const [alerts, setAlerts] = React.useState([])
  const [consumers, setConsumers] = React.useState([])
  const [selected, setSelected] = React.useState(null)
  const [timeline, setTimeline] = React.useState(null)
  const [timelineLoading, setTimelineLoading] = React.useState(false)
  const [timelineError, setTimelineError] = React.useState('')

  React.useEffect(() => {
    if (!databaseEnabled) return undefined
    const controller = new AbortController()
    setTrendLoading(true)
    setTrendError('')
    json(`${API}/history/trend?range=${encodeURIComponent(range)}&bucket=${encodeURIComponent(bucket)}&metric=${encodeURIComponent(metric)}`, controller.signal)
      .then(setTrend)
      .catch((error) => {
        if (error.name !== 'AbortError') setTrendError(error.message || 'Unable to load historical trend.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setTrendLoading(false)
      })
    return () => controller.abort()
  }, [bucket, databaseEnabled, metric, range, refreshToken])

  React.useEffect(() => {
    if (!databaseEnabled) return undefined
    const controller = new AbortController()
    const alertDays = Math.max(1, Math.ceil((RANGE_HOURS[range] || 24) / 24))
    Promise.allSettled([
      json(`${API}/history/alerts?days=${alertDays}&limit=500`, controller.signal),
      json(`${API}/history/top-consumers?days=90&limit=20`, controller.signal),
    ]).then(([alertResult, consumerResult]) => {
      if (controller.signal.aborted) return
      if (alertResult.status === 'fulfilled') setAlerts(alertResult.value.items || [])
      if (consumerResult.status === 'fulfilled') setConsumers(consumerResult.value.items || [])
    })
    return () => controller.abort()
  }, [databaseEnabled, range, refreshToken])

  const selectPoint = React.useCallback((point) => {
    setSelected(point)
    setTimeline(null)
    setTimelineError('')
    if (!point?.at) return
    setTimelineLoading(true)
    const collectionQuery = point.collectionId ? `&collection_id=${encodeURIComponent(point.collectionId)}` : ''
    json(`${API}/history/timeline?at=${encodeURIComponent(point.at)}&window_minutes=5${collectionQuery}`)
      .then(setTimeline)
      .catch((error) => setTimelineError(error.message || 'Unable to correlate selected timestamp.'))
      .finally(() => setTimelineLoading(false))
  }, [])

  if (!databaseEnabled) {
    return <section className="rundeckMonitoring">
      <div className="rundeckMonitoringHead"><h3>{TERMS.resourceTrend}</h3></div>
      <div className="rundeckHistoryState">Historical telemetry is not available yet.</div>
    </section>
  }

  const recentCutoff = Date.now() - (RANGE_HOURS[range] || 24) * 60 * 60 * 1000
  const visibleAlerts = alerts.filter((row) => {
    const timestamp = new Date(row.collected_at).getTime()
    return Number.isFinite(timestamp) && timestamp >= recentCutoff
  })
  const criticalCount = visibleAlerts.filter((row) => row.severity === 'CRITICAL').length
  const warningCount = visibleAlerts.filter((row) => row.severity === 'WARNING').length
  const trendItems = trend?.items || []
  const timeBuckets = new Set(trendItems.map((row) => row.bucket).filter(Boolean)).size
  const hostCount = new Set(trendItems.map((row) => row.host).filter(Boolean)).size
  const populatedPoints = trendItems.filter((row) => Number(row.samples || 0) > 0).length
  const expectedPoints = timeBuckets * EXPECTED_HOSTS
  const coveragePct = expectedPoints ? Math.round((populatedPoints / expectedPoints) * 100) : 0

  return <section className="rundeckMonitoring">
    <div className="rundeckMonitoringHead">
      <h3>{TERMS.resourceTrend}</h3>
      <div className="rundeckMonitoringCoverage">
        <strong>{hostCount} of {EXPECTED_HOSTS}</strong>
        <span>{TERMS.telemetryCoverage}</span>
        <small>{populatedPoints} of {expectedPoints || 0} samples · {coveragePct}%</small>
      </div>
    </div>

    <div className="rundeckTrendToolbar">
      <div className="rundeckControlGroup"><span>Metric</span><Segmented options={METRICS} value={metric} onChange={setMetric} ariaLabel="Historical metric" /></div>
      <div className="rundeckControlGroup"><span>Range</span><Segmented options={RANGES} value={range} onChange={setRange} ariaLabel="Historical range" /></div>
      <div className="rundeckControlGroup"><span>Plot</span><Segmented options={[["avg", "AVG"], ["max", "PEAK"]]} value={mode} onChange={setMode} ariaLabel="Historical plot mode" /></div>
    </div>

    <details className="rundeckAdvancedControls">
      <summary>Advanced</summary>
      <div><span>Resolution</span><Segmented options={BUCKETS} value={bucket} onChange={setBucket} ariaLabel="Historical aggregation bucket" /></div>
    </details>

    <div className="rundeckTrendMeta">
      <span><b>{trend?.metric_label || METRICS.find(([key]) => key === metric)?.[1]}</b>{mode === 'max' ? 'PEAK' : 'AVG'}</span>
      <span><b>Warning</b>{trend?.warning ?? '—'}{trend?.warning !== null && trend?.warning !== undefined ? trend?.unit : ''}</span>
      <span><b>Critical</b>{trend?.critical ?? '—'}{trend?.critical !== null && trend?.critical !== undefined ? trend?.unit : ''}</span>
      <span><b>Resolution</b>{trend?.bucket || '—'}</span>
      <span><b>Timezone</b>WIB</span>
    </div>

    {trendLoading && <div className="rundeckHistoryState">Loading historical telemetry…</div>}
    {trendError && <div className="rundeckHistoryState is-error">{trendError}</div>}
    {!trendLoading && !trendError && trend && trend.items?.length > 0 && <TrendChart trend={trend} mode={mode} range={range} onSelect={selectPoint} />}
    {!trendLoading && !trendError && trend && !trend.items?.length && <div className="rundeckHistoryState">Historical telemetry will populate from new DB-backed collection cycles.</div>}

    <HistoricalRca selected={selected} data={timeline} loading={timelineLoading} error={timelineError} />

    <section className="rundeckOpsSection">
      <div className="rundeckOpsHead">
        <h4>Active SAP Alerts</h4>
        <span>{criticalCount} critical · {warningCount} warning</span>
      </div>
      <div className="rundeckMiniTableWrap">
        <table>
          <thead><tr><th>Time WIB</th><th>Server</th><th>Severity</th><th>Signal</th></tr></thead>
          <tbody>
            {visibleAlerts.slice(0, 10).map((row) => <tr key={row.id}>
              <td>{formatWib(row.collected_at, true)}</td>
              <td>{shortHost(row.host || 'COLLECTOR')}</td>
              <td><InlineStatus value={row.severity} /></td>
              <td>{row.code === 'WP_CRITICAL' ? TERMS.criticalWorkProcess : row.code === 'IOWAIT_HIGH' ? 'I/O Wait Threshold' : row.message}</td>
            </tr>)}
            {!visibleAlerts.length && <tr><td colSpan="4">No active threshold alerts in this range.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>

    <section className="rundeckOpsSection">
      <div className="rundeckOpsHead">
        <h4>{TERMS.historicalWorkload}</h4>
        <span>90-day workload frequency</span>
      </div>
      <div className="rundeckMiniTableWrap">
        <table>
          <thead><tr><th>Workload</th><th>Server</th><th>Seen</th><th>Avg CPU</th><th>Peak CPU</th></tr></thead>
          <tbody>
            {consumers.slice(0, 10).map((row) => <tr key={`${row.consumer_type}-${row.consumer_key}-${row.host}`}>
              <td title={row.consumer_key}><strong>{row.consumer_key}</strong><small>{row.consumer_type}</small></td>
              <td>{shortHost(row.host)}</td>
              <td>{row.occurrences}</td>
              <td>{number(row.avg_cpu_pct)}%</td>
              <td>{number(row.peak_cpu_pct)}%</td>
            </tr>)}
            {!consumers.length && <tr><td colSpan="5">Historical SAP workload will populate from new collection cycles.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  </section>
}
