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
  grid: themeToken('--sphere-chart-grid', 'rgba(126, 147, 158, .08)'),
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
  if (delta > 0) return `${duration} after issue`
  if (delta < 0) return `${duration} before issue`
  return 'Same time as issue'
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

function chartProfile(rows = []) {
  const pssValues = rows.map((row) => rowMetric(row, 'pss')).filter((value) => value !== null)
  const readValues = rows.map((row) => rowMetric(row, 'read')).filter((value) => value !== null)
  const writeValues = rows.map((row) => rowMetric(row, 'write')).filter((value) => value !== null)
  const wpValues = rows.map((row) => rowMetric(row, 'wp')).filter((value) => value !== null)
  return {
    hasPss: pssValues.length > 0,
    hasIo: [...readValues, ...writeValues].some((value) => Math.abs(value) > 0),
    hasWp: wpValues.length > 0,
    wpVariable: new Set(wpValues.map((value) => Number(value).toFixed(2))).size > 1,
    hasCritical: rows.some((row) => Number(row.host_wp_critical || 0) > 0),
  }
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
      <span><b>Process CPU</b>{numberText(rowMetric(row, 'cpu'), 1)}%</span>
      {pss !== null && <span><b>PSS</b>{numberText(pss, 2)} GB</span>}
      {(Math.abs(read || 0) > 0 || Math.abs(write || 0) > 0)
        ? <><span><b>IO Read</b>{numberText(read, 2)} MiB/s</span><span><b>IO Write</b>{numberText(write, 2)} MiB/s</span></>
        : <span><b>IO</b>0 MiB/s</span>}
      <span><b>WP</b>{numberText(wp, 0)}</span>
      {critical > 0 && <span className="is-attention"><b>APP Critical WP</b>{critical}</span>}
    </div>
    <div className="rundeckSingleSampleAxis"><i /><strong>{formatWib(row.collected_at, false)}</strong></div>
  </div>
}

function UnifiedJobPerformanceChart({ items, incidentStart }) {
  const ref = React.useRef(null)
  const chartConfig = React.useMemo(() => {
    const colors = palette()
    const rows = [...items].sort((left, right) => Date.parse(left.collected_at || '') - Date.parse(right.collected_at || ''))
    const profile = chartProfile(rows)
    const firstTs = Date.parse(rows[0]?.collected_at || '')
    const lastTs = Date.parse(rows.at(-1)?.collected_at || '')
    const issueTs = Date.parse(incidentStart || '')
    const issueInRange = Number.isFinite(issueTs) && Number.isFinite(firstTs) && Number.isFinite(lastTs) && issueTs >= firstTs && issueTs <= lastTs

    const lanes = [
      { id: 'cpu', name: 'Process CPU %', height: 62 },
      profile.hasPss ? { id: 'pss', name: 'PSS GB', height: 42 } : null,
      profile.hasIo ? { id: 'io', name: 'IO MiB/s', height: 38 } : null,
      profile.hasWp ? { id: 'wp', name: 'WP', height: profile.wpVariable ? 34 : 22 } : null,
      profile.hasCritical ? { id: 'event', name: '', height: 16 } : null,
    ].filter(Boolean)

    let top = 16
    const gap = 14
    const grids = lanes.map((lane) => {
      const grid = { left: 58, right: 18, top, height: lane.height }
      top += lane.height + gap
      return grid
    })
    const chartHeight = Math.max(170, top + 30)
    const laneIndex = Object.fromEntries(lanes.map((lane, index) => [lane.id, index]))

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
    const line = (name, key, laneId, color, extra = {}) => {
      const index = laneIndex[laneId]
      if (index === undefined) return null
      return {
        name,
        type: 'line',
        xAxisIndex: index,
        yAxisIndex: index,
        showSymbol: rows.length <= 36,
        symbolSize: 4,
        smooth: false,
        connectNulls: false,
        lineStyle: { width: 1.6, color },
        itemStyle: { color },
        emphasis: { focus: 'series' },
        data: metricSeriesData(rows, key),
        ...extra,
      }
    }
    const issueMark = issueInRange ? {
      silent: true,
      symbol: ['none', 'none'],
      lineStyle: { color: colors.warning, type: 'dashed', width: 1 },
      label: { formatter: 'Issue start', color: colors.warning, fontSize: 8 },
      data: [{ xAxis: incidentStart }],
    } : undefined

    const series = [
      line('Process CPU', 'cpu', 'cpu', colors.accent, { markLine: issueMark }),
      profile.hasPss ? line('PSS', 'pss', 'pss', colors.memory) : null,
      profile.hasIo ? line('IO Read', 'read', 'io', colors.ioRead) : null,
      profile.hasIo ? line('IO Write', 'write', 'io', colors.ioWrite) : null,
      profile.hasWp ? line('WP Count', 'wp', 'wp', colors.wp, { step: 'middle' }) : null,
      profile.hasCritical ? {
        name: 'APP Critical WP',
        type: 'scatter',
        xAxisIndex: laneIndex.event,
        yAxisIndex: laneIndex.event,
        symbol: 'triangle',
        symbolSize: (value, params) => Math.min(11, 6 + Number(params?.data?.critical || 0)),
        itemStyle: { color: colors.danger },
        data: rows.filter((row) => Number(row.host_wp_critical || 0) > 0).map((row) => ({ value: [row.collected_at, .5], critical: Number(row.host_wp_critical || 0) })),
      } : null,
    ].filter(Boolean)

    return {
      height: chartHeight,
      profile,
      option: {
        animationDuration: 150,
        backgroundColor: 'transparent',
        textStyle: { color: colors.text },
        grid: grids,
        xAxis: lanes.map((lane, index) => ({
          ...axisBase,
          gridIndex: index,
          axisLabel: index === lanes.length - 1 ? axisBase.axisLabel : { show: false },
          axisLine: index === lanes.length - 1 ? axisBase.axisLine : { show: false },
        })),
        yAxis: lanes.map((lane, index) => lane.id === 'event'
          ? { type: 'value', gridIndex: index, min: 0, max: 1, show: false }
          : {
              ...yBase,
              gridIndex: index,
              name: lane.name,
              splitLine: lane.id === 'wp' && !profile.wpVariable ? { show: false } : yBase.splitLine,
              splitNumber: lane.id === 'wp' ? 1 : 2,
              axisLabel: lane.id === 'wp'
                ? { ...yBase.axisLabel, formatter: (value) => Math.round(value) }
                : yBase.axisLabel,
            }),
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
              `Process CPU <b>${numberText(rowMetric(row, 'cpu'), 1)}%</b>`,
              profile.hasPss ? `PSS <b>${numberText(rowMetric(row, 'pss'), 2)} GB</b>` : '',
              profile.hasIo ? `IO Read <b>${numberText(rowMetric(row, 'read'), 2)} MiB/s</b>` : 'IO <b>0 MiB/s</b>',
              profile.hasIo ? `IO Write <b>${numberText(rowMetric(row, 'write'), 2)} MiB/s</b>` : '',
              profile.hasWp ? `WP <b>${numberText(rowMetric(row, 'wp'), 0)}</b>` : '',
              critical > 0 ? `APP Critical WP <b>${critical}</b>` : '',
              `Run <b>#${row.execution_id || String(row.collection_id || '').replace('rundeck-', '') || '—'}</b>`,
            ].filter(Boolean).join('<br/>')
          },
        },
        dataZoom: [{ type: 'inside', xAxisIndex: lanes.map((_, index) => index), filterMode: 'none' }],
        series,
      },
    }
  }, [incidentStart, items])

  React.useEffect(() => {
    if (!ref.current) return undefined
    echarts.getInstanceByDom?.(ref.current)?.dispose()
    const chart = echarts.init(ref.current, null, { renderer: 'canvas' })
    chart.setOption(chartConfig.option, true)
    const resize = () => chart.resize()
    window.addEventListener('resize', resize)
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    observer?.observe(ref.current)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', resize)
      chart.dispose()
    }
  }, [chartConfig.option])

  return <div className="rundeckJobPerformanceWrap">
    {!chartConfig.profile.hasIo && <div className="rundeckHiddenMetric">IO 0 MiB/s</div>}
    <div ref={ref} className="rundeckJobPerformanceChart" style={{ height: `${chartConfig.height}px` }} role="img" aria-label="Workload process CPU, PSS, IO, work process and APP critical work process timeline with WIB time axis" />
  </div>
}

export default function RundeckJobHistory({ job = null, refreshToken = '', incidentStart = '', latestCollectionId = '' }) {
  const [history, setHistory] = React.useState(null)
  const [resolvedJob, setResolvedJob] = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const jobKey = job?.key || ''
  const jobHost = job?.host || ''
  const jobConsumerType = job?.consumerType || ''
  const jobAt = job?.at || ''

  React.useEffect(() => {
    if (!jobKey) {
      setHistory(null)
      setResolvedJob(null)
      setError('')
      return undefined
    }

    const controller = new AbortController()
    const requestedJob = { key: jobKey, host: jobHost, consumerType: jobConsumerType, at: jobAt }
    setLoading(true)
    setError('')
    loadHistory(requestedJob, controller.signal)
      .then((result) => {
        setHistory(result)
        setResolvedJob(requestedJob)
      })
      .catch((failure) => {
        if (failure.name !== 'AbortError') setError(failure.message || 'Workload history unavailable')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [jobAt, jobConsumerType, jobHost, jobKey, refreshToken])

  if (!jobKey) return null

  const displayJob = resolvedJob || { key: jobKey, host: jobHost, consumerType: jobConsumerType, at: jobAt }
  const displayKey = displayJob.key || jobKey
  const displayHost = displayJob.host || jobHost
  const displayConsumerType = displayJob.consumerType || jobConsumerType
  const displayAt = displayJob.at || ''
  const changingSelection = Boolean(
    history && resolvedJob && loading && (
      resolvedJob.key !== jobKey || resolvedJob.host !== jobHost || resolvedJob.consumerType !== jobConsumerType || resolvedJob.at !== jobAt
    )
  )
  const episodeItemsAsc = selectObservationEpisode(history?.items || [], displayAt)
  const episodeItems = [...episodeItemsAsc].reverse()
  const stats = episodeStats(episodeItemsAsc)
  const latest = episodeItems[0] || null
  const latestDetails = latest?.details || {}
  const isCurrent = Boolean(latestCollectionId && latest?.collection_id === latestCollectionId)
  const correlation = temporalText(incidentStart, stats.firstSeen)
  const observed = durationText(stats.firstSeen, stats.lastSeen)
  const profile = chartProfile(episodeItems)

  return <section className="rundeckJobHistory" aria-label="Selected workload performance">
    <div className="rundeckJobHistoryHead">
      <div>
        <span>Selected Workload</span>
        <h3><SphereIcon name="target" /> {displayKey} {history && <em className={isCurrent ? 'is-current' : 'is-ended'}>{isCurrent ? 'CURRENT' : 'NO LONGER SEEN'}</em>}</h3>
        <small>{shortHost(displayHost || latest?.host || '')} · {workloadTypeLabel(displayConsumerType || latest?.consumer_type)}{latestDetails.program ? ` · ${latestDetails.program}` : ''}</small>
      </div>
    </div>

    {loading && !history && <div className="rundeckJobHistoryState">Loading workload history…</div>}
    {loading && history && <div className="rundeckJobHistoryState is-updating">{changingSelection ? 'Updating selected workload…' : 'Refreshing workload…'}</div>}
    {error && <div className="rundeckJobHistoryState is-error">{error}</div>}

    {history && <>
      <div className="rundeckJobHistorySummary">
        <span><b>First Seen</b>{formatWib(stats.firstSeen, true)} WIB</span>
        <span><b>Last Seen</b>{formatWib(stats.lastSeen, true)} WIB</span>
        <span><b>Duration</b>{observed}</span>
        <span><b>Checks</b>{episodeItems.length}</span>
      </div>
      <div className="rundeckJobHistorySummary is-secondary">
        <span><b>Avg Process CPU</b>{numberText(stats.avgCpu)}%</span>
        <span><b>Peak Process CPU</b>{numberText(stats.peakCpu)}%</span>
      </div>

      {(incidentStart || correlation) && <div className="rundeckJobCorrelation">
        {incidentStart && <span>Issue start {formatWib(incidentStart, true)} WIB</span>}
        {stats.firstSeen && <span>First Seen {formatWib(stats.firstSeen, true)} WIB</span>}
        {correlation && <strong>{correlation}</strong>}
      </div>}

      <div className="rundeckJobPerformanceTitle">
        <h4><SphereIcon name="trend" /> Workload Performance</h4>
        {profile.hasCritical && <span><i /> APP Critical WP</span>}
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
            <thead><tr><th>Time WIB</th><th>Run</th><th>APP</th><th>Process CPU</th><th>PSS</th><th>WP</th><th>Critical WP</th></tr></thead>
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
