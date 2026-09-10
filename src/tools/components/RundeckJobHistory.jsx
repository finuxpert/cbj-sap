import React from 'react'
import * as echarts from './logEcharts.js'
import SphereIcon from './SphereIcon.jsx'
import { formatWib, numberText, shortHost, workloadTypeLabel } from './sapUiFormat.js'
import './RundeckJobHistory.css'

const API = `${import.meta.env.BASE_URL}api`
const GAP_MS = 25 * 60 * 1000

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
  grid: themeToken('--sphere-chart-grid', 'rgba(126, 147, 158, .10)'),
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

function observationEpisodes(items = []) {
  const rows = [...items]
    .filter((row) => Number.isFinite(Date.parse(row?.collected_at || '')))
    .sort((left, right) => Date.parse(left.collected_at) - Date.parse(right.collected_at))
  const episodes = []
  let current = []
  rows.forEach((row) => {
    const timestamp = Date.parse(row.collected_at)
    const previous = current.at(-1)
    const previousTimestamp = previous ? Date.parse(previous.collected_at) : null
    if (previous && Number.isFinite(previousTimestamp) && timestamp - previousTimestamp > GAP_MS) {
      episodes.push(current)
      current = []
    }
    current.push(row)
  })
  if (current.length) episodes.push(current)
  return episodes
}

function selectObservationEpisode(items, targetAt = '') {
  const episodes = observationEpisodes(items)
  if (!episodes.length) return []
  const target = Date.parse(targetAt || '')
  if (!Number.isFinite(target)) return episodes.at(-1)

  let best = episodes[0]
  let bestDistance = Number.POSITIVE_INFINITY
  episodes.forEach((episode) => {
    episode.forEach((row) => {
      const distance = Math.abs(Date.parse(row.collected_at) - target)
      if (distance < bestDistance) {
        bestDistance = distance
        best = episode
      }
    })
  })
  return best
}

function episodeStats(items = []) {
  if (!items.length) return { firstSeen: '', lastSeen: '', avgCpu: null, peakCpu: null }
  const ordered = [...items].sort((left, right) => Date.parse(left.collected_at) - Date.parse(right.collected_at))
  const cpu = ordered.map((row) => numeric(row.cpu_pct)).filter((value) => value !== null)
  return {
    firstSeen: ordered[0]?.collected_at || '',
    lastSeen: ordered.at(-1)?.collected_at || '',
    avgCpu: cpu.length ? cpu.reduce((sum, value) => sum + value, 0) / cpu.length : null,
    peakCpu: cpu.length ? Math.max(...cpu) : null,
  }
}

function durationText(firstSeen, lastSeen) {
  const first = Date.parse(firstSeen || '')
  const last = Date.parse(lastSeen || '')
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) return '—'
  const minutes = Math.max(0, Math.round((last - first) / 60000))
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
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
  if (delta > 0) return `Seen ${duration} after issue`
  if (delta < 0) return `Seen ${duration} before issue`
  return 'First seen when issue started'
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

function metricSeriesData(rows, key) {
  return rows.map((row) => [row.collected_at, rowMetric(row, key)])
}

function SingleSamplePerformance({ row }) {
  const pss = rowMetric(row, 'pss')
  const read = rowMetric(row, 'read')
  const write = rowMetric(row, 'write')
  const wp = rowMetric(row, 'wp')
  const critical = Number(row.host_wp_critical || 0)
  return <div className="rundeckSingleSample" aria-label="Single workload sample">
    <div className="rundeckSingleSampleTime">{formatWib(row.collected_at, true)} WIB</div>
    <div className="rundeckSingleSampleMetrics">
      <span><b>CPU</b>{numberText(rowMetric(row, 'cpu'), 1)}%</span>
      <span><b>PSS</b>{pss === null ? '—' : `${numberText(pss, 2)} GB`}</span>
      <span><b>IO Read</b>{read === null ? '—' : `${numberText(read, 2)} MiB/s`}</span>
      <span><b>IO Write</b>{write === null ? '—' : `${numberText(write, 2)} MiB/s`}</span>
      <span><b>WP</b>{numberText(wp, 0)}</span>
      <span className={critical > 0 ? 'is-attention' : ''}><b>APP Critical WP</b>{critical}</span>
    </div>
    <div className="rundeckSingleSampleAxis"><i /><strong>{formatWib(row.collected_at, false)}</strong></div>
  </div>
}

function UnifiedJobPerformanceChart({ items, incidentStart }) {
  const ref = React.useRef(null)
  const option = React.useMemo(() => {
    const colors = palette()
    const rows = [...items].sort((left, right) => Date.parse(left.collected_at || '') - Date.parse(right.collected_at || ''))
    const firstTs = Date.parse(rows[0]?.collected_at || '')
    const lastTs = Date.parse(rows.at(-1)?.collected_at || '')
    const issueTs = Date.parse(incidentStart || '')
    const issueInRange = Number.isFinite(issueTs) && Number.isFinite(firstTs) && Number.isFinite(lastTs) && issueTs >= firstTs && issueTs <= lastTs
    const hasIo = rows.some((row) => Math.abs(rowMetric(row, 'read') || 0) > 0 || Math.abs(rowMetric(row, 'write') || 0) > 0)

    const axisBase = {
      type: 'time',
      min: firstTs,
      max: lastTs,
      axisLine: { lineStyle: { color: colors.grid } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: {
        color: colors.muted,
        fontSize: 9,
        hideOverlap: true,
        showMinLabel: true,
        showMaxLabel: true,
        formatter: (value) => formatWib(value, false),
      },
      axisPointer: { show: true, snap: true, lineStyle: { color: colors.muted, width: 1, type: 'dashed' } },
    }
    const yBase = {
      type: 'value',
      min: 0,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: colors.grid, width: 1 } },
      splitNumber: 2,
      axisLabel: { color: colors.muted, fontSize: 8.5, margin: 8 },
      nameTextStyle: { color: colors.muted, fontSize: 9, align: 'left' },
    }
    const line = (name, key, xAxisIndex, yAxisIndex, color, extra = {}) => ({
      name,
      type: 'line',
      xAxisIndex,
      yAxisIndex,
      showSymbol: rows.length <= 40,
      symbolSize: 4,
      smooth: false,
      connectNulls: false,
      lineStyle: { width: 1.6, color },
      itemStyle: { color },
      emphasis: { focus: 'series' },
      data: metricSeriesData(rows, key),
      ...extra,
    })
    const issueMark = issueInRange ? {
      silent: true,
      symbol: ['none', 'none'],
      lineStyle: { color: colors.warning, type: 'dashed', width: 1 },
      label: { formatter: 'Issue', color: colors.warning, fontSize: 8 },
      data: [{ xAxis: incidentStart }],
    } : undefined

    const ioHeight = hasIo ? 44 : 24
    const wpTop = 176 + ioHeight
    const eventTop = wpTop + 56
    const totalBottom = eventTop + 38

    return {
      animationDuration: 150,
      backgroundColor: 'transparent',
      textStyle: { color: colors.text },
      grid: [
        { left: 62, right: 18, top: 18, height: 70 },
        { left: 62, right: 18, top: 105, height: 52 },
        { left: 62, right: 18, top: 176, height: ioHeight },
        { left: 62, right: 18, top: wpTop, height: 38 },
        { left: 62, right: 18, top: eventTop, height: 18 },
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
        { ...yBase, gridIndex: 2, name: hasIo ? 'IO MiB/s' : 'IO 0 MiB/s', splitLine: { show: hasIo, lineStyle: { color: colors.grid } }, axisLabel: hasIo ? yBase.axisLabel : { show: false } },
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
      dataZoom: [{ type: 'inside', xAxisIndex: [0, 1, 2, 3, 4], filterMode: 'none' }],
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
          symbolSize: (value, params) => Math.min(11, 6 + Number(params?.data?.critical || 0)),
          itemStyle: { color: colors.danger },
          data: rows.filter((row) => Number(row.host_wp_critical || 0) > 0).map((row) => ({ value: [row.collected_at, .5], critical: Number(row.host_wp_critical || 0) })),
        },
      ],
      graphic: [{ type: 'text', right: 18, top: totalBottom - 10, style: { text: 'Time WIB', fill: colors.muted, fontSize: 8 } }],
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

  return <div ref={ref} className="rundeckJobPerformanceChart" role="img" aria-label="CPU, PSS, IO, work process and APP critical work process timeline with WIB time axis" />
}

export default function RundeckJobHistory({ job = null, refreshToken = '', incidentStart = '', latestCollectionId = '', latestCollectionAt = '' }) {
  const [history, setHistory] = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const jobKey = job?.key || ''
  const jobHost = job?.host || ''
  const jobConsumerType = job?.consumerType || ''
  const jobAt = job?.at || ''

  React.useEffect(() => {
    if (!jobKey) {
      setHistory(null)
      setError('')
      return undefined
    }

    const controller = new AbortController()
    setLoading(true)
    setError('')
    loadHistory({ key: jobKey, host: jobHost, consumerType: jobConsumerType }, controller.signal)
      .then(setHistory)
      .catch((failure) => {
        if (failure.name !== 'AbortError') setError(failure.message || 'Workload history unavailable')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [jobConsumerType, jobHost, jobKey, refreshToken])

  if (!jobKey) return null

  const episodeItemsAsc = selectObservationEpisode(history?.items || [], jobAt)
  const episodeItems = [...episodeItemsAsc].reverse()
  const stats = episodeStats(episodeItemsAsc)
  const latest = episodeItems[0] || null
  const latestDetails = latest?.details || {}
  const isCurrent = Boolean(latestCollectionId && latest?.collection_id === latestCollectionId)
  const correlation = temporalText(incidentStart, stats.firstSeen)
  const observed = durationText(stats.firstSeen, stats.lastSeen)

  return <section className="rundeckJobHistory" aria-label="Selected workload performance">
    <div className="rundeckJobHistoryHead">
      <div>
        <span>Selected Workload</span>
        <h3><SphereIcon name="target" /> {jobKey}</h3>
        <small>{shortHost(jobHost || latest?.host || '')} · {workloadTypeLabel(jobConsumerType || latest?.consumer_type)}{latestDetails.program ? ` · ${latestDetails.program}` : ''}</small>
      </div>
      <strong className={isCurrent ? 'is-current' : 'is-ended'}>{isCurrent ? 'CURRENT' : 'NOT SEEN IN LATEST CHECK'}</strong>
    </div>

    {loading && <div className="rundeckJobHistoryState">Loading workload history…</div>}
    {error && <div className="rundeckJobHistoryState is-error">{error}</div>}

    {!loading && !error && history && <>
      <div className="rundeckJobHistorySummary">
        <span><b>First Seen</b>{formatWib(stats.firstSeen, true)} WIB</span>
        <span><b>Last Seen</b>{formatWib(stats.lastSeen, true)} WIB</span>
        <span><b>Observed</b>{observed}</span>
        <span><b>Seen</b>{episodeItems.length} checks</span>
        <span><b>Latest CPU</b>{numberText(latest?.cpu_pct)}%</span>
        <span><b>Avg CPU</b>{numberText(stats.avgCpu)}%</span>
        <span><b>Peak CPU</b>{numberText(stats.peakCpu)}%</span>
        {!isCurrent && latestCollectionAt && <span><b>Latest Check</b>{formatWib(latestCollectionAt, true)} WIB</span>}
      </div>

      {(incidentStart || correlation) && <div className="rundeckJobCorrelation">
        {incidentStart && <span>Issue {formatWib(incidentStart, true)} WIB</span>}
        {stats.firstSeen && <span>First Seen {formatWib(stats.firstSeen, true)} WIB</span>}
        {correlation && <strong>{correlation}</strong>}
      </div>}

      <div className="rundeckJobPerformanceTitle">
        <h4><SphereIcon name="trend" /> Workload Performance</h4>
        <span><i /> APP Critical WP</span>
      </div>

      {episodeItems.length === 1
        ? <SingleSamplePerformance row={episodeItems[0]} />
        : episodeItems.length > 1
          ? <UnifiedJobPerformanceChart items={episodeItems} incidentStart={incidentStart} />
          : <div className="rundeckJobHistoryState">No stored history for this workload yet.</div>}

      <details className="rundeckJobExecutionHistory">
        <summary><SphereIcon name="history" /> Observation History <span>{episodeItems.length} samples</span></summary>
        <div className="rundeckJobHistoryTableWrap">
          <table>
            <thead><tr><th>Time WIB</th><th>Run</th><th>APP</th><th>CPU</th><th>PSS</th><th>WP</th><th>Critical WP</th></tr></thead>
            <tbody>
              {episodeItems.map((row) => {
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
