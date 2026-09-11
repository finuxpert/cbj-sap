import React from 'react'
import * as echarts from './logEcharts.js'
import RundeckJobHistory from './RundeckJobHistory.jsx'
import RundeckPerformanceEvaluation from './RundeckPerformanceEvaluation.jsx'
import SphereIcon from './SphereIcon.jsx'
import { formatWib, numberText, shortHost } from './sapUiFormat.js'
import { hostResourceState } from './rundeckStatusSemantics.js'
import './RundeckMonitoringHistory.css'
import './RundeckEvidence.css'

const API = `${import.meta.env.BASE_URL}api`
const DEFAULT_RANGE = '6h'

const RANGES = [
  ['6h', '6H'],
  ['24h', '24H'],
  ['7d', '7D'],
  ['30d', '30D'],
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
  ['ram', 'RAM'],
  ['load', 'Load'],
  ['iowait', 'IO Wait'],
  ['wp', 'Critical WP Count'],
]

const RANGE_HOURS = { '6h': 6, '24h': 24, '7d': 168, '30d': 720, '90d': 2160 }

const metricLabel = (value, fallback = 'Metric') => {
  if (value === 'swap') return 'Swap IO'
  return METRICS.find(([key]) => key === value)?.[1] || fallback
}

const rangeLabel = (value) => RANGES.find(([key]) => key === value)?.[1] || (value === '90d' ? '90D' : String(value || '').toUpperCase())

const themeToken = (name, fallback) => {
  if (typeof window === 'undefined') return fallback
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

const chartTheme = () => ({
  text: themeToken('--sphere-text', '#e7edf0'),
  secondary: themeToken('--sphere-text-secondary', '#a9b5bb'),
  muted: themeToken('--sphere-text-muted', '#718089'),
  grid: themeToken('--sphere-chart-grid', 'rgba(126,147,158,.08)'),
  panel: themeToken('--sphere-surface-1', '#141d23'),
  accentSoft: themeToken('--sphere-accent-soft', 'rgba(79,198,200,.14)'),
  warning: themeToken('--sphere-warning', '#d8b35f'),
  danger: themeToken('--sphere-danger', '#db7d86'),
  series: [
    themeToken('--sphere-chart-1', '#72a9e8'),
    themeToken('--sphere-chart-2', '#8cc985'),
    themeToken('--sphere-chart-3', '#aaa0df'),
    themeToken('--sphere-chart-4', '#e1a16c'),
    themeToken('--sphere-chart-5', '#5dcbd1'),
  ],
})

async function json(url, signal) {
  const response = await fetch(url, { cache: 'no-store', signal })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed (${response.status})`)
  }
  return response.json()
}

const wpSeverity = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 'ATTENTION'
  return numeric >= 3 ? 'CRITICAL' : 'ATTENTION'
}

const displayAlertSeverity = (row = {}, value = undefined) => {
  if (row.code === 'WP_CRITICAL') {
    const resolvedValue = value ?? row.latest_value ?? row.details?.value
    return wpSeverity(resolvedValue)
  }
  return String(row.current_severity || row.severity || 'WARNING').toUpperCase()
}

const displayPeakSeverity = (row = {}) => {
  if (row.peak_severity) return String(row.peak_severity).toUpperCase()
  if (row.code === 'WP_CRITICAL') return wpSeverity(row.peak_value)
  const current = String(row.current_severity || row.severity || 'WARNING').toUpperCase()
  const peak = Number(row.peak_value)
  const critical = Number(row.evidence?.[0]?.details?.critical)
  if (Number.isFinite(peak) && Number.isFinite(critical) && peak >= critical) return 'CRITICAL'
  return current
}

const durationText = (seconds) => {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value < 0) return '—'
  if (value < 60) return '<1m'
  const minutes = Math.floor(value / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

const incidentMetric = (value, unit = '') => {
  if (value === null || value === undefined || value === '') return '—'
  return `${numberText(value, unit === '%' ? 1 : 0)}${unit}`
}

function useEChart(option, onChartClick) {
  const ref = React.useRef(null)

  React.useEffect(() => {
    if (!ref.current) return undefined
    echarts.getInstanceByDom?.(ref.current)?.dispose()
    const chart = echarts.init(ref.current, null, { renderer: 'canvas' })
    chart.setOption(option, true)
    const handleChartClick = (event) => onChartClick?.(chart, event)
    chart.getZr().on('click', handleChartClick)
    chart.getZr().setCursorStyle('crosshair')
    const resize = () => chart.resize()
    window.addEventListener('resize', resize)
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    observer?.observe(ref.current)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', resize)
      chart.getZr().off('click', handleChartClick)
      chart.dispose()
    }
  }, [option, onChartClick])

  return ref
}

function nearestTrendPoint(chart, event, option) {
  const pixel = [event?.offsetX, event?.offsetY]
  if (!Number.isFinite(pixel[0]) || !Number.isFinite(pixel[1])) return null
  if (!chart.containPixel({ gridIndex: 0 }, pixel)) return null

  let nearest = null
  let nearestDistance = Number.POSITIVE_INFINITY
  ;(option?.series || []).forEach((series, seriesIndex) => {
    ;(series?.data || []).forEach((item, dataIndex) => {
      const point = chart.convertToPixel({ seriesIndex }, item.value)
      if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return
      const dx = point[0] - pixel[0]
      const dy = point[1] - pixel[1]
      const distance = (dx * dx) + (dy * dy)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearest = { seriesIndex, dataIndex, data: item }
      }
    })
  })
  return nearest
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
        name: 'Warn',
        lineStyle: { color: palette.warning, type: 'dashed', opacity: .45 },
        label: { formatter: `Warn ${trend.warning}${suffix}`, color: palette.warning, fontSize: 8, position: 'insideEndTop', distance: 4 },
      })
    }
    if (trend?.critical !== null && trend?.critical !== undefined) {
      thresholdLines.push({
        yAxis: Number(trend.critical),
        name: 'Crit',
        lineStyle: { color: palette.danger, type: 'dashed', opacity: .48 },
        label: { formatter: `Crit ${trend.critical}${suffix}`, color: palette.danger, fontSize: 8, position: 'insideEndTop', distance: 4 },
      })
    }

    const shortRange = range === '6h' || range === '24h'
    const dataZoom = [{ type: 'inside', filterMode: 'none' }]
    if (!shortRange) {
      dataZoom.push({
        type: 'slider',
        bottom: 5,
        height: 8,
        filterMode: 'none',
        borderColor: palette.grid,
        backgroundColor: 'transparent',
        fillerColor: palette.accentSoft,
        textStyle: { color: palette.muted, fontSize: 8 },
      })
    }

    return {
      animationDuration: 140,
      backgroundColor: 'transparent',
      color: palette.series,
      textStyle: { color: palette.text },
      legend: { top: 0, type: 'scroll', itemWidth: 14, itemHeight: 8, data: hosts.map(shortHost), textStyle: { color: palette.secondary, fontSize: 9 }, pageTextStyle: { color: palette.muted } },
      grid: { left: 52, right: 58, top: 38, bottom: shortRange ? 28 : 43 },
      tooltip: {
        trigger: 'axis',
        confine: true,
        axisPointer: { type: 'line', lineStyle: { color: palette.muted, width: 1, type: 'dashed' } },
        backgroundColor: palette.panel,
        borderWidth: 0,
        textStyle: { color: palette.text, fontSize: 10 },
        formatter: (items = []) => {
          if (!items.length) return ''
          const first = items[0]?.data || {}
          const title = `<b>${formatWib(first.bucket || first.value?.[0], true)} WIB</b>`
          const body = items.map((item) => {
            const row = item.data || {}
            const value = mode === 'max' ? row.max : row.avg
            return `${item.marker}${item.seriesName}: <b>${numberText(value, trend?.metric === 'wp' ? 0 : 1)}${suffix}</b>`
          }).join('<br/>')
          return `${title}<br/>${body}`
        },
      },
      xAxis: {
        type: 'time',
        axisLabel: {
          color: palette.muted,
          fontSize: 9,
          hideOverlap: true,
          showMinLabel: true,
          showMaxLabel: true,
          formatter: (value) => range === '6h' || range === '24h'
            ? formatWib(value, false)
            : new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', hour: '2-digit', hour12: false }).format(new Date(value)),
        },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: palette.grid } },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        name: `${trend?.metric_label || ''}${trend?.unit ? ` (${trend.unit})` : ''}`,
        nameTextStyle: { color: palette.muted, fontSize: 9 },
        axisLabel: { color: palette.muted, fontSize: 9, formatter: (value) => `${value}${trend?.unit === '%' ? '%' : ''}` },
        axisTick: { show: false },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: palette.grid, type: 'solid', width: 1 } },
        min: trend?.unit === '%' ? 0 : undefined,
        max: trend?.unit === '%' ? 100 : undefined,
        splitNumber: 2,
      },
      dataZoom,
      series: hosts.map((host, index) => {
        const hostRows = byHost.get(host) || []
        return {
          name: shortHost(host),
          type: 'line',
          connectNulls: false,
          showSymbol: range === '6h' && hostRows.length <= 48,
          symbolSize: 4,
          lineStyle: { width: 1.5 },
          emphasis: { focus: 'series', scale: 1.35 },
          data: hostRows.map((row) => ({ value: [row.bucket, row[valueKey]], bucket: row.bucket, peakAt: row.peak_at, peakCollectionId: row.peak_collection_id, host: row.host, avg: row.avg_value, max: row.max_value })),
          markLine: index === 0 && thresholdLines.length ? { silent: true, symbol: ['none', 'none'], data: thresholdLines } : undefined,
        }
      }),
    }
  }, [mode, range, trend])

  const click = React.useCallback((chart, event) => {
    const nearest = nearestTrendPoint(chart, event, option)
    if (!nearest?.data) return
    chart.dispatchAction({ type: 'showTip', seriesIndex: nearest.seriesIndex, dataIndex: nearest.dataIndex })
    const data = nearest.data
    onSelect?.({ host: data.host, at: data.peakAt || data.bucket, collectionId: data.peakCollectionId || '', bucket: data.bucket, avg: data.avg, max: data.max, value: mode === 'max' ? data.max : data.avg, mode, metricLabel: trend?.metric_label || '', unit: trend?.unit || '' })
  }, [mode, onSelect, option, trend?.metric_label, trend?.unit])

  const ref = useEChart(option, click)
  return <div ref={ref} className="rundeckTrendChart" role="img" aria-label={`${trend?.metric_label || 'Metric'} trend for application servers`} />
}

function Segmented({ options, value, onChange, ariaLabel }) {
  return <div className="rundeckSegmented" role="group" aria-label={ariaLabel}>
    {options.map(([key, label]) => <button key={key} type="button" className={value === key ? 'is-active' : ''} aria-pressed={value === key} onClick={() => onChange(key)}>{label}</button>)}
  </div>
}

function InlineStatus({ value = 'UNKNOWN' }) {
  return <span className={`rundeckInlineStatus is-${String(value).toLowerCase()}`}>{value}</span>
}

function HistoricalRca({ selected, data, loading, error, panelRef, selectedJob, onSelectJob }) {
  if (!selected && !loading && !error) return <div className="rundeckRcaHint">Click chart to inspect workload at that time.</div>

  const rows = data?.items || []
  const selectedRow = rows.find((row) => row.host === selected?.host) || rows[0] || null
  const consumer = selectedRow?.top_consumers?.[0] || null
  const details = consumer?.details || {}
  const selectedJobContext = consumer?.consumer_key ? { key: consumer.consumer_key, host: selectedRow?.host || selected?.host || '', consumerType: consumer.consumer_type || '', source: 'selected-time', at: selected?.at || '' } : null
  const jobSelected = selectedJobContext && selectedJob?.key === selectedJobContext.key && selectedJob?.host === selectedJobContext.host
  const selectedMetricIsCpu = String(selected?.metricLabel || '').toUpperCase() === 'CPU'
  const facts = [
    details.program ? ['Program', details.program] : null,
    [details.wp_type, details.wp].filter(Boolean).length ? ['WP', [details.wp_type, details.wp].filter(Boolean).join(' ')] : null,
    details.pid ? ['PID', details.pid] : null,
  ].filter(Boolean)

  return <section ref={panelRef} tabIndex="-1" className="rundeckRcaSection" aria-live="polite">
    <div className="rundeckRcaHeader">
      <div>
        <span>Selected Time</span>
        <h4><SphereIcon name="target" /> {selected?.host ? shortHost(selected.host) : 'APP'}</h4>
        <small>{selected?.at ? `${formatWib(selected.at, true)} WIB` : 'Loading'}</small>
      </div>
      {selectedRow && <InlineStatus value={hostResourceState(selectedRow)} />}
    </div>

    {loading && <div className="rundeckHistoryState">Loading workload…</div>}
    {error && <div className="rundeckHistoryState is-error">{error}</div>}

    {!loading && !error && selectedRow && <>
      <div className="rundeckRcaMetricStrip">
        <span><b>{selected?.metricLabel || 'Metric'}</b>{numberText(selected?.value)}{selected?.unit ? ` ${selected.unit}` : ''}</span>
        {!selectedMetricIsCpu && <span><b>CPU</b>{numberText(selectedRow.cpu_pct)}%</span>}
        <span><b>RAM</b>{numberText(selectedRow.ram_pct)}%</span>
        <span><b>IO Wait</b>{numberText(selectedRow.io_wait_pct)}%</span>
        <span><b>Critical WP Count</b>{numberText(selectedRow.wp_critical, 0)}</span>
      </div>

      <div className="rundeckRcaWorkload">
        <div className="rundeckRcaWorkloadTitle">
          <span>Top Workload</span>
          {selectedJobContext ? <button type="button" className={`rundeckRcaJobButton ${jobSelected ? 'is-selected' : ''}`} onClick={() => onSelectJob?.(selectedJobContext)}>{consumer.consumer_key}</button> : <strong>No workload found</strong>}
          {consumer && <small>CPU {numberText(consumer.cpu_pct)}% · PSS {details.pss_gb === null || details.pss_gb === undefined ? '—' : `${numberText(details.pss_gb, 2)} GB`}</small>}
        </div>
        {facts.length > 0 && <dl>{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
      </div>
    </>}

    {!loading && !error && data && !selectedRow && <div className="rundeckHistoryState">No SAP data found for this time.</div>}
  </section>
}

export default function RundeckMonitoringHistory({
  refreshToken = '',
  databaseEnabled = false,
  selectedJob = null,
  onSelectJob,
  currentWorkloadContent = null,
  incidentStart = '',
  latestCollectionId = '',
  latestCollectionAt = '',
  onTrendContext,
}) {
  const [range, setRange] = React.useState(DEFAULT_RANGE)
  const [bucket, setBucket] = React.useState('auto')
  const [metric, setMetric] = React.useState('cpu')
  const [mode, setMode] = React.useState('max')
  const [trend, setTrend] = React.useState(null)
  const [trendLoading, setTrendLoading] = React.useState(false)
  const [trendError, setTrendError] = React.useState('')
  const [alerts, setAlerts] = React.useState([])
  const [alertError, setAlertError] = React.useState('')
  const [selected, setSelected] = React.useState(null)
  const [timeline, setTimeline] = React.useState(null)
  const [timelineLoading, setTimelineLoading] = React.useState(false)
  const [timelineError, setTimelineError] = React.useState('')
  const rcaRef = React.useRef(null)

  React.useEffect(() => {
    setRange(DEFAULT_RANGE)
    setBucket('auto')
  }, [])

  React.useEffect(() => {
    onTrendContext?.({
      metric,
      metricLabel: trend?.metric_label || metricLabel(metric),
      range,
      rangeLabel: rangeLabel(range),
      mode,
    })
  }, [metric, mode, onTrendContext, range, trend?.metric_label])

  React.useEffect(() => {
    if (!databaseEnabled) return undefined
    const controller = new AbortController()
    setTrendLoading(true)
    setTrendError('')
    json(`${API}/history/trend?range=${encodeURIComponent(range)}&bucket=${encodeURIComponent(bucket)}&metric=${encodeURIComponent(metric)}`, controller.signal)
      .then(setTrend)
      .catch((error) => { if (error.name !== 'AbortError') setTrendError(error.message || 'Unable to load trend.') })
      .finally(() => { if (!controller.signal.aborted) setTrendLoading(false) })
    return () => controller.abort()
  }, [bucket, databaseEnabled, metric, range, refreshToken])

  React.useEffect(() => {
    if (!databaseEnabled) return undefined
    const controller = new AbortController()
    const alertDays = Math.max(1, Math.ceil((RANGE_HOURS[range] || 24) / 24))
    setAlertError('')
    json(`${API}/history/incidents?days=${alertDays}&limit=200`, controller.signal)
      .then((result) => setAlerts(result.items || []))
      .catch((error) => { if (error.name !== 'AbortError') setAlertError(error.message || 'Unable to load SAP issues.') })
    return () => controller.abort()
  }, [databaseEnabled, range, refreshToken])

  React.useEffect(() => {
    setSelected(null)
    setTimeline(null)
    setTimelineError('')
  }, [bucket, metric, mode, range])

  React.useEffect(() => {
    if (!selected) return
    const frame = window.requestAnimationFrame(() => rcaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
    return () => window.cancelAnimationFrame(frame)
  }, [selected])

  const selectPoint = React.useCallback((point) => {
    setSelected(point)
    setTimeline(null)
    setTimelineError('')
    if (!point?.at) return
    setTimelineLoading(true)
    const collectionQuery = point.collectionId ? `&collection_id=${encodeURIComponent(point.collectionId)}` : ''
    json(`${API}/history/timeline?at=${encodeURIComponent(point.at)}&window_minutes=5${collectionQuery}`)
      .then(setTimeline)
      .catch((error) => setTimelineError(error.message || 'Unable to load workload.'))
      .finally(() => setTimelineLoading(false))
  }, [])

  if (!databaseEnabled) {
    return <section className="rundeckMonitoring"><div className="rundeckMonitoringHead"><h3><SphereIcon name="trend" /> Server Trend</h3></div><div className="rundeckHistoryState">Trend data is not available yet.</div>{currentWorkloadContent}</section>
  }

  const recentCutoff = Date.now() - (RANGE_HOURS[range] || 24) * 60 * 60 * 1000
  const visibleAlerts = alerts.filter((row) => {
    if (row.state === 'ACTIVE') return true
    const timestamp = new Date(row.resolved_at || row.last_seen || row.first_seen).getTime()
    return Number.isFinite(timestamp) && timestamp >= recentCutoff
  })
  const activeCount = visibleAlerts.filter((row) => row.state === 'ACTIVE').length
  const resolvedCount = visibleAlerts.filter((row) => row.state === 'RESOLVED').length

  return <section className="rundeckMonitoring">
    <div className="rundeckMonitoringHead"><h3><SphereIcon name="trend" /> Server Trend</h3></div>

    <div className="rundeckTrendToolbar">
      <div className="rundeckTrendGroup"><Segmented options={METRICS} value={metric} onChange={setMetric} ariaLabel="Performance metric" /></div>
      <div className="rundeckTrendGroup"><Segmented options={RANGES} value={range} onChange={setRange} ariaLabel="Time period" /></div>
      <div className="rundeckTrendGroup"><Segmented options={[["avg", "Avg"], ["max", "Peak"]]} value={mode} onChange={setMode} ariaLabel="Trend view" /></div>
    </div>

    <details className="rundeckAdvancedControls">
      <summary>More</summary>
      <div>
        <button type="button" className={range === '90d' ? 'is-active' : ''} onClick={() => setRange('90d')}>90D</button>
        <button type="button" className={metric === 'swap' ? 'is-active' : ''} onClick={() => setMetric('swap')}>Swap IO</button>
        <Segmented options={BUCKETS} value={bucket} onChange={setBucket} ariaLabel="Trend interval" />
      </div>
    </details>

    {trendLoading && <div className="rundeckHistoryState">Loading trend…</div>}
    {trendError && <div className="rundeckHistoryState is-error">{trendError}</div>}
    {!trendLoading && !trendError && trend && trend.items?.length > 0 && <TrendChart trend={trend} mode={mode} range={range} onSelect={selectPoint} />}
    {!trendLoading && !trendError && trend && !trend.items?.length && <div className="rundeckHistoryState">Trend data will appear after new Rundeck runs are stored.</div>}

    <HistoricalRca selected={selected} data={timeline} loading={timelineLoading} error={timelineError} panelRef={rcaRef} selectedJob={selectedJob} onSelectJob={onSelectJob} />

    {currentWorkloadContent}

    <RundeckJobHistory job={selectedJob} refreshToken={refreshToken} incidentStart={incidentStart} latestCollectionId={latestCollectionId} latestCollectionAt={latestCollectionAt} />

    <RundeckPerformanceEvaluation refreshToken={refreshToken} selectedJob={selectedJob} onSelectJob={onSelectJob} />

    <details className="rundeckEvidenceGroup">
      <summary><SphereIcon name="alert" /> SAP Issues <span>{alertError ? 'unavailable' : `${activeCount} active · ${resolvedCount} resolved`}</span></summary>
      <div className="rundeckEvidenceBody">
        <section className="rundeckOpsSection">
          <div className="rundeckMiniTableWrap rundeckIncidentTableWrap">
            <table className="rundeckIncidentTable">
              <thead><tr><th>APP</th><th>SAP Signal</th><th>State</th><th>Current Severity</th><th>Peak Severity</th><th>First Seen</th><th>Last Seen</th><th>Duration</th><th>Checks</th><th>Peak / Latest</th><th>Evidence</th></tr></thead>
              <tbody>
                {visibleAlerts.slice(0, 50).map((row) => {
                  const currentSeverity = String(row.current_severity || displayAlertSeverity(row, row.latest_value)).toUpperCase()
                  const peakSeverity = displayPeakSeverity(row)
                  const evidence = row.evidence || []
                  return <tr key={row.id} className={row.state === 'ACTIVE' ? 'is-active-incident' : ''}>
                    <td><strong>{shortHost(row.host || 'APP')}</strong></td>
                    <td className="rundeckIncidentSignal">{row.signal || row.code}</td>
                    <td className="rundeckIncidentState"><InlineStatus value={row.state || 'UNKNOWN'} /></td>
                    <td><InlineStatus value={currentSeverity} /></td>
                    <td><InlineStatus value={peakSeverity} /></td>
                    <td>{formatWib(row.first_seen, true)}</td>
                    <td>{formatWib(row.last_seen, true)}</td>
                    <td>{durationText(row.duration_seconds)}</td>
                    <td>{numberText(row.checks, 0)}</td>
                    <td>{incidentMetric(row.peak_value, row.unit)} / {incidentMetric(row.latest_value, row.unit)}</td>
                    <td>
                      <details className="rundeckIncidentEvidence">
                        <summary>{row.evidence_count || evidence.length} rows</summary>
                        <div className="rundeckIncidentEvidenceBody">
                          {evidence.map((item) => <div key={item.id} className="rundeckIncidentEvidenceRow" title={String(item.collected_at || '')}>
                            <span>{formatWib(item.collected_at, true)}</span>
                            <span>Run #{item.execution_id || '—'}</span>
                            <span>{displayAlertSeverity(item, item.details?.value)}</span>
                            <span>{incidentMetric(item.details?.value, row.unit)}</span>
                            <span title={item.collection_id || undefined}>{item.message || item.code}</span>
                          </div>)}
                          {!evidence.length && <div className="rundeckIncidentEvidenceEmpty">No raw signal rows stored for this incident.</div>}
                        </div>
                      </details>
                    </td>
                  </tr>
                })}
                {alertError && <tr><td colSpan="11" className="rundeckIncidentError">SAP issue lifecycle is temporarily unavailable.</td></tr>}
                {!alertError && !visibleAlerts.length && <tr><td colSpan="11">No SAP issues in this period.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </details>
  </section>
}
