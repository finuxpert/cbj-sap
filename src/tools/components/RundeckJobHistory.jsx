import React from 'react'
import * as echarts from './logEcharts.js'
import { formatWib, numberText, shortHost, workloadTypeLabel } from './sapUiFormat.js'
import './RundeckJobHistory.css'

const API = `${import.meta.env.BASE_URL}api`

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
  text: themeToken('--sphere-text', '#e7edf0'),
  secondary: themeToken('--sphere-text-secondary', '#a9b5bb'),
  muted: themeToken('--sphere-text-muted', '#718089'),
  grid: themeToken('--sphere-chart-grid', 'rgba(126, 147, 158, .12)'),
  panel: themeToken('--sphere-surface-1', '#141d23'),
  accent: themeToken('--sphere-accent', '#4fc6c8'),
  memory: themeToken('--sphere-memory', '#8ba7d9'),
  ioRead: themeToken('--sphere-io-read', '#7bb89c'),
  ioWrite: themeToken('--sphere-io-write', '#b49ac8'),
  wp: themeToken('--sphere-wp', '#d0a96c'),
  warning: themeToken('--sphere-warning', '#d8b35f'),
  danger: themeToken('--sphere-danger', '#db7d86'),
})

async function loadHistory(job, signal) {
  const params = new URLSearchParams({ job: job.key, days: '90', limit: '500' })
  if (job.host) params.set('host', job.host)
  if (job.consumerType) params.set('type', job.consumerType)
  const response = await fetch(`${API}/history/job?${params.toString()}`, { cache: 'no-store', signal })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.detail || `Workload history unavailable (${response.status})`)
  }
  return response.json()
}

function rowMetric(row, key) {
  const details = row?.details || {}
  if (key === 'cpu') return numeric(row?.cpu_pct)
  if (key === 'pss') return numeric(details.pss_gb)
  if (key === 'read') return numeric(details.read_mib_s)
  if (key === 'write') return numeric(details.write_mib_s)
  if (key === 'wp') return numeric(details.process_count) ?? numeric(details.wps?.length) ?? 1
  return null
}

function temporalText(issueStart, firstSeen) {
  const issue = Date.parse(issueStart || '')
  const first = Date.parse(firstSeen || '')
  if (!Number.isFinite(issue) || !Number.isFinite(first)) return ''
  const delta = first - issue
  const absMinutes = Math.round(Math.abs(delta) / 60000)
  const hours = Math.floor(absMinutes / 60)
  const minutes = absMinutes % 60
  const duration = [hours ? `${hours}h` : '', minutes ? `${minutes}m` : ''].filter(Boolean).join(' ') || '<1m'
  if (delta > 0) return `Workload appeared ${duration} after issue started`
  if (delta < 0) return `Workload was already visible ${duration} before issue started`
  return 'Workload first seen when issue started'
}

function nearestRow(rows, value) {
  const target = Date.parse(value || '')
  if (!Number.isFinite(target) || !rows.length) return rows[0] || null
  return rows.reduce((best, row) => {
    const current = Date.parse(row.collected_at || '')
    if (!Number.isFinite(current)) return best
    if (!best) return row
    const bestTime = Date.parse(best.collected_at || '')
    return Math.abs(current - target) < Math.abs(bestTime - target) ? row : best
  }, null)
}

function UnifiedJobPerformanceChart({ items, incidentStart }) {
  const ref = React.useRef(null)
  const option = React.useMemo(() => {
    const colors = palette()
    const rows = [...items].reverse()
    const firstTs = Date.parse(rows[0]?.collected_at || '')
    const lastTs = Date.parse(rows.at(-1)?.collected_at || '')
    const issueTs = Date.parse(incidentStart || '')
    const issueInRange = Number.isFinite(issueTs) && Number.isFinite(firstTs) && Number.isFinite(lastTs) && issueTs >= firstTs && issueTs <= lastTs
    const axisBase = {
      type: 'time',
      axisLine: { lineStyle: { color: colors.grid } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { color: colors.muted, fontSize: 9, hideOverlap: true, formatter: (value) => formatWib(value, false) },
      axisPointer: { show: true, snap: true, lineStyle: { color: colors.muted, width: 1, type: 'dashed' } },
    }
    const yBase = {
      type: 'value',
      min: 0,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: colors.grid, width: 1 } },
      axisLabel: { color: colors.muted, fontSize: 9, margin: 8 },
      nameTextStyle: { color: colors.muted, fontSize: 9, align: 'left' },
    }
    const line = (name, key, xAxisIndex, yAxisIndex, color, extra = {}) => ({
      name,
      type: 'line',
      xAxisIndex,
      yAxisIndex,
      showSymbol: rows.length <= 80,
      symbolSize: 4,
      smooth: false,
      connectNulls: false,
      lineStyle: { width: 1.6, color },
      itemStyle: { color },
      emphasis: { focus: 'series' },
      data: rows.map((row) => [row.collected_at, rowMetric(row, key)]),
      ...extra,
    })
    const issueMark = issueInRange ? {
      silent: true,
      symbol: ['none', 'none'],
      lineStyle: { color: colors.warning, type: 'dashed', width: 1 },
      label: { formatter: 'Issue started', color: colors.warning, fontSize: 8 },
      data: [{ xAxis: incidentStart }],
    } : undefined

    return {
      animationDuration: 170,
      backgroundColor: 'transparent',
      textStyle: { color: colors.text },
      grid: [
        { left: 58, right: 18, top: 18, height: 76 },
        { left: 58, right: 18, top: 112, height: 58 },
        { left: 58, right: 18, top: 188, height: 58 },
        { left: 58, right: 18, top: 264, height: 54 },
        { left: 58, right: 18, top: 336, height: 26 },
      ],
      xAxis: [0, 1, 2, 3, 4].map((index) => ({
        ...axisBase,
        gridIndex: index,
        axisLabel: index === 4 ? axisBase.axisLabel : { show: false },
        axisLine: index === 4 ? axisBase.axisLine : { show: false },
      })),
      yAxis: [
        { ...yBase, gridIndex: 0, name: 'CPU %' },
        { ...yBase, gridIndex: 1, name: 'PSS GB' },
        { ...yBase, gridIndex: 2, name: 'IO MiB/s' },
        { ...yBase, gridIndex: 3, name: 'WP', axisLabel: { ...yBase.axisLabel, formatter: (value) => Math.round(value) } },
        { type: 'value', gridIndex: 4, min: 0, max: 1, show: false },
      ],
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: colors.panel,
        borderWidth: 0,
        textStyle: { color: colors.text, fontSize: 10 },
        formatter: (points = []) => {
          if (!points.length) return ''
          const row = nearestRow(rows, points[0]?.axisValue)
          if (!row) return ''
          const critical = Number(row.host_wp_critical || 0)
          return [
            `<b>${formatWib(row.collected_at, true)} WIB</b>`,
            `CPU <b>${numberText(rowMetric(row, 'cpu'), 1)}%</b>`,
            `PSS <b>${rowMetric(row, 'pss') === null ? '—' : `${numberText(rowMetric(row, 'pss'), 2)} GB`}</b>`,
            `IO Read <b>${rowMetric(row, 'read') === null ? '—' : `${numberText(rowMetric(row, 'read'), 2)} MiB/s`}</b>`,
            `IO Write <b>${rowMetric(row, 'write') === null ? '—' : `${numberText(rowMetric(row, 'write'), 2)} MiB/s`}</b>`,
            `WP <b>${numberText(rowMetric(row, 'wp'), 0)}</b>`,
            critical > 0 ? `APP Critical WP <b>${critical}</b>` : 'APP Critical WP 0',
            `Run <b>#${row.execution_id || String(row.collection_id || '').replace('rundeck-', '') || '—'}</b>`,
          ].join('<br/>')
        },
      },
      dataZoom: [
        { type: 'inside', xAxisIndex: [0, 1, 2, 3, 4], filterMode: 'none' },
        { type: 'slider', xAxisIndex: [0, 1, 2, 3, 4], bottom: 3, height: 10, filterMode: 'none', borderColor: colors.grid, backgroundColor: 'transparent', fillerColor: 'rgba(79,198,200,.14)', textStyle: { color: colors.muted, fontSize: 8 } },
      ],
      series: [
        line('CPU', 'cpu', 0, 0, colors.accent, { markLine: issueMark }),
        line('PSS', 'pss', 1, 1, colors.memory),
        line('IO Read', 'read', 2, 2, colors.ioRead),
        line('IO Write', 'write', 2, 2, colors.ioWrite),
        line('WP Count', 'wp', 3, 3, colors.wp, { step: 'middle' }),
        {
          name: 'APP Critical WP',
          type: 'scatter',
          xAxisIndex: 4,
          yAxisIndex: 4,
          symbol: 'triangle',
          symbolSize: (value, params) => Math.min(12, 6 + Number(params?.data?.critical || 0)),
          itemStyle: { color: colors.danger },
          data: rows.filter((row) => Number(row.host_wp_critical || 0) > 0).map((row) => ({ value: [row.collected_at, .5], critical: Number(row.host_wp_critical || 0) })),
        },
      ],
    }
  }, [incidentStart, items])

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

  return <div ref={ref} className="rundeckJobPerformanceChart" role="img" aria-label="CPU, PSS, IO, work process and APP critical work process timeline" />
}

export default function RundeckJobHistory({ job = null, refreshToken = '', incidentStart = '', latestCollectionId = '' }) {
  const [history, setHistory] = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

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
        if (failure.name !== 'AbortError') setError(failure.message || 'Workload history unavailable')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [job?.consumerType, job?.host, job?.key, refreshToken])

  if (!job?.key) return null

  const items = history?.items || []
  const latest = items[0] || null
  const latestDetails = latest?.details || {}
  const isCurrent = Boolean(latestCollectionId && latest?.collection_id === latestCollectionId)
  const correlation = temporalText(incidentStart, history?.first_seen)

  return <section className="rundeckJobHistory" aria-label="Selected workload performance">
    <div className="rundeckJobHistoryHead">
      <div>
        <span>Selected Workload</span>
        <h3>{job.key}</h3>
        <small>{shortHost(job.host || latest?.host || '')} · {workloadTypeLabel(job.consumerType || latest?.consumer_type)}{latestDetails.program ? ` · ${latestDetails.program}` : ''}</small>
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

      {(incidentStart || correlation) && <div className="rundeckJobCorrelation">
        {incidentStart && <span>Issue {formatWib(incidentStart, true)} WIB</span>}
        {history.first_seen && <span>First seen {formatWib(history.first_seen, true)} WIB</span>}
        {correlation && <strong>{correlation}</strong>}
      </div>}

      <div className="rundeckJobPerformanceTitle">
        <h4>Job Performance</h4>
        <span><i /> APP Critical WP</span>
      </div>

      {items.length > 0
        ? <UnifiedJobPerformanceChart items={items} incidentStart={incidentStart} />
        : <div className="rundeckJobHistoryState">No stored history for this workload yet.</div>}

      <details className="rundeckJobExecutionHistory">
        <summary>Execution History <span>{items.length} samples</span></summary>
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
