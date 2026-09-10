import React from 'react'
import * as echarts from './logEcharts.js'
import { formatWib, numberText, shortHost, workloadTypeLabel } from './sapUiFormat.js'
import './RundeckJobHistory.css'

const API = `${import.meta.env.BASE_URL}api`
const METRICS = [
  ['cpu', 'CPU'],
  ['memory', 'Memory'],
  ['io', 'IO'],
  ['wp', 'WP'],
]

const numeric = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const themeToken = (name, fallback) => {
  if (typeof window === 'undefined') return fallback
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

const palette = () => ({
  text: themeToken('--sphere-text', '#edf1f4'),
  secondary: themeToken('--sphere-text-secondary', '#b1bbc4'),
  muted: themeToken('--sphere-text-muted', '#7f8c97'),
  border: themeToken('--sphere-border', '#323d48'),
  grid: themeToken('--sphere-border-subtle', '#28323c'),
  panel: themeToken('--sphere-surface-1', '#192129'),
  warning: themeToken('--sphere-warning', '#e8c86b'),
  danger: themeToken('--sphere-danger', '#ef8a94'),
})

async function loadHistory(job, signal) {
  const params = new URLSearchParams({ job: job.key, days: '90', limit: '500' })
  if (job.host) params.set('host', job.host)
  if (job.consumerType) params.set('type', job.consumerType)
  const response = await fetch(`${API}/history/job?${params.toString()}`, { cache: 'no-store', signal })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.detail || `SAP Job History unavailable (${response.status})`)
  }
  return response.json()
}

function metricValues(row, metric) {
  const details = row?.details || {}
  if (metric === 'memory') return [{ key: 'pss', label: 'PSS', value: numeric(details.pss_gb), unit: 'GB' }]
  if (metric === 'io') return [
    { key: 'read', label: 'Read', value: numeric(details.read_mib_s), unit: 'MiB/s' },
    { key: 'write', label: 'Write', value: numeric(details.write_mib_s), unit: 'MiB/s' },
  ]
  if (metric === 'wp') return [{ key: 'wp', label: 'WP Count', value: numeric(details.process_count) ?? numeric(details.wps?.length) ?? 1, unit: '' }]
  return [{ key: 'cpu', label: 'CPU', value: numeric(row?.cpu_pct), unit: '%' }]
}

function JobPerformanceChart({ items, metric, incidentStart }) {
  const ref = React.useRef(null)
  const option = React.useMemo(() => {
    const colors = palette()
    const ascending = [...items].reverse()
    const definitions = metricValues(ascending.find(Boolean) || {}, metric)
    const unit = definitions[0]?.unit || ''
    const series = definitions.map((definition, index) => ({
      name: definition.label,
      type: 'line',
      showSymbol: ascending.length <= 80,
      symbolSize: 6,
      connectNulls: false,
      data: ascending.map((row) => {
        const current = metricValues(row, metric).find((item) => item.key === definition.key)
        return [row.collected_at, current?.value ?? null]
      }),
      markLine: index === 0 && incidentStart ? {
        silent: true,
        symbol: ['none', 'none'],
        lineStyle: { color: colors.warning, type: 'dashed', width: 1 },
        label: { formatter: 'SAP issue started', color: colors.warning, fontSize: 9 },
        data: [{ xAxis: incidentStart }],
      } : undefined,
      markPoint: index === 0 ? {
        symbol: 'circle',
        symbolSize: 8,
        label: { show: false },
        itemStyle: { color: colors.danger },
        data: ascending.flatMap((row) => {
          if (Number(row.host_wp_critical || 0) <= 0) return []
          const y = metricValues(row, metric)[0]?.value
          return y === null || y === undefined ? [] : [{ coord: [row.collected_at, y], value: row.host_wp_critical }]
        }),
      } : undefined,
    }))

    return {
      animationDuration: 150,
      backgroundColor: 'transparent',
      textStyle: { color: colors.text },
      grid: { left: 54, right: 18, top: 30, bottom: 52 },
      legend: definitions.length > 1 ? { top: 0, textStyle: { color: colors.secondary } } : undefined,
      tooltip: {
        trigger: 'axis',
        backgroundColor: colors.panel,
        borderColor: colors.border,
        textStyle: { color: colors.text },
        formatter: (points = []) => {
          if (!points.length) return ''
          const time = formatWib(points[0].axisValue, true)
          const body = points.map((point) => `${point.marker}${point.seriesName}: <b>${numberText(point.value?.[1], metric === 'wp' ? 0 : 2)}${unit ? ` ${unit}` : ''}</b>`).join('<br/>')
          const sourceRow = ascending.find((row) => new Date(row.collected_at).getTime() === new Date(points[0].axisValue).getTime())
          const wp = Number(sourceRow?.host_wp_critical || 0)
          return `<b>${time} WIB</b><br/>${body}${wp > 0 ? `<br/>Critical WP: <b>${wp}</b>` : ''}`
        },
      },
      xAxis: {
        type: 'time',
        axisLabel: { color: colors.muted, hideOverlap: true, formatter: (value) => formatWib(value, false) },
        axisLine: { lineStyle: { color: colors.border } },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        min: 0,
        name: unit,
        nameTextStyle: { color: colors.muted },
        axisLabel: { color: colors.muted },
        splitLine: { lineStyle: { color: colors.grid, type: 'dashed' } },
      },
      dataZoom: [
        { type: 'inside', filterMode: 'none' },
        { type: 'slider', bottom: 8, height: 12, filterMode: 'none', borderColor: colors.border, backgroundColor: colors.panel, textStyle: { color: colors.muted } },
      ],
      series,
    }
  }, [incidentStart, items, metric])

  React.useEffect(() => {
    if (!ref.current) return undefined
    echarts.getInstanceByDom?.(ref.current)?.dispose()
    const chart = echarts.init(ref.current, null, { renderer: 'canvas' })
    chart.setOption(option, true)
    const resize = () => chart.resize()
    window.addEventListener('resize', resize)
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    observer?.observe(ref.current)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', resize)
      chart.dispose()
    }
  }, [option])

  return <div ref={ref} className="rundeckJobPerformanceChart" role="img" aria-label="Selected SAP workload performance trend" />
}

export default function RundeckJobHistory({ job = null, refreshToken = '', incidentStart = '', latestCollectionId = '' }) {
  const [history, setHistory] = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [metric, setMetric] = React.useState('cpu')

  React.useEffect(() => {
    if (!job?.key) {
      setHistory(null)
      setError('')
      return undefined
    }

    const controller = new AbortController()
    setLoading(true)
    setError('')
    loadHistory(job, controller.signal)
      .then(setHistory)
      .catch((failure) => {
        if (failure.name !== 'AbortError') setError(failure.message || 'SAP Job History unavailable')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [job?.consumerType, job?.host, job?.key, refreshToken])

  React.useEffect(() => setMetric('cpu'), [job?.key, job?.host])

  if (!job?.key) return null

  const items = history?.items || []
  const latest = items[0] || null
  const latestDetails = latest?.details || {}
  const isCurrent = Boolean(latestCollectionId && latest?.collection_id === latestCollectionId)

  return <section className="rundeckJobHistory" aria-label="Selected SAP workload performance">
    <div className="rundeckJobHistoryHead">
      <div>
        <span>Selected Workload</span>
        <h3>{job.key}</h3>
        <small>{workloadTypeLabel(job.consumerType)} · {job.host ? shortHost(job.host) : 'All APP'}{latestDetails.program ? ` · ${latestDetails.program}` : ''}</small>
      </div>
      <strong className={isCurrent ? 'is-current' : ''}>{isCurrent ? 'CURRENT' : 'LAST SEEN'}</strong>
    </div>

    {loading && <div className="rundeckJobHistoryState">Loading workload history…</div>}
    {error && <div className="rundeckJobHistoryState is-error">{error}</div>}

    {!loading && !error && history && <>
      <div className="rundeckJobHistorySummary">
        <span><b>First Seen</b>{formatWib(history.first_seen, true)} WIB</span>
        <span><b>Last Seen</b>{formatWib(history.last_seen, true)} WIB</span>
        <span><b>Seen</b>{history.checks || 0} checks</span>
        <span><b>Latest CPU</b>{numberText(latest?.cpu_pct)}%</span>
        <span><b>Avg CPU</b>{numberText(history.avg_cpu_pct)}%</span>
        <span><b>Peak CPU</b>{numberText(history.peak_cpu_pct)}%</span>
      </div>

      <div className="rundeckJobMetricTabs" role="group" aria-label="SAP workload trend metric">
        {METRICS.map(([key, label]) => <button key={key} type="button" className={metric === key ? 'is-active' : ''} onClick={() => setMetric(key)}>{label}</button>)}
        <span><i /> Critical WP</span>
      </div>

      {items.length > 0
        ? <JobPerformanceChart items={items} metric={metric} incidentStart={incidentStart} />
        : <div className="rundeckJobHistoryState">No stored history for this workload yet.</div>}

      <details className="rundeckJobExecutionHistory">
        <summary>Job Execution History <span>{items.length} samples</span></summary>
        <div className="rundeckJobHistoryTableWrap">
          <table>
            <thead><tr><th>Time WIB</th><th>Run</th><th>APP</th><th>CPU</th><th>PSS</th><th>WP</th><th>Critical WP</th></tr></thead>
            <tbody>
              {items.map((row) => {
                const details = row.details || {}
                const wp = [details.wp_type, details.wp].filter(Boolean).join(' ') || '—'
                const pss = numeric(details.pss_gb)
                return <tr key={`${row.collection_id}-${row.host}-${row.collected_at}`}>
                  <td>{formatWib(row.collected_at, true)}</td>
                  <td>#{row.execution_id || String(row.collection_id || '').replace('rundeck-', '') || '—'}</td>
                  <td title={row.host}>{shortHost(row.host)}</td>
                  <td>{numberText(row.cpu_pct)}%</td>
                  <td>{pss === null ? '—' : `${numberText(pss, 2)} GB`}</td>
                  <td>{wp}</td>
                  <td>{numberText(row.host_wp_critical, 0)}</td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
      </details>
    </>}
  </section>
}
