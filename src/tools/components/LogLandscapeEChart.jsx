import React from 'react'
import * as echarts from 'echarts'

const METRICS = {
  cpuPct: { label: 'CPU', suffix: '%', digits: 1 },
  memoryPct: { label: 'RAM', suffix: '%', digits: 1 },
  resourceLoadRatio: { label: 'Load1/vCPU', suffix: '', digits: 2 },
  load15Ratio: { label: 'Load15/vCPU', suffix: '', digits: 2 },
  swapIn: { label: 'Swap In', suffix: ' p/s', digits: 0 },
  wpCritical: { label: 'WP Critical', suffix: '', digits: 0 },
}

const metricValue = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
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

export function LandscapeResourceEChart({ rca, metric = 'memoryPct', onSelectTime, onSelectCollection }) {
  const meta = METRICS[metric] || METRICS.memoryPct
  const collections = rca?.collections || []
  const option = React.useMemo(() => {
    const times = collections.map((row) => row.timeLabel)
    const hosts = rca?.hosts || []
    const resourcePeakTime = rca?.resourceLandscapePeak?.timeLabel || rca?.landscapePeak?.timeLabel || ''
    const operationalPeakTime = rca?.operationalLandscapePeak?.timeLabel || ''
    const peakLines = []
    if (resourcePeakTime) peakLines.push({ xAxis: resourcePeakTime, name: 'Resource landscape peak', label: { formatter: `Resource peak\n${resourcePeakTime}`, position: 'insideEndTop' } })
    if (operationalPeakTime && operationalPeakTime !== resourcePeakTime) peakLines.push({ xAxis: operationalPeakTime, name: 'Operational landscape peak', label: { formatter: `Operational peak\n${operationalPeakTime}`, position: 'insideEndBottom' } })

    const series = hosts.map((host, index) => ({
      name: host,
      type: 'line',
      showSymbol: times.length <= 40,
      symbolSize: 6,
      connectNulls: false,
      emphasis: { focus: 'series' },
      data: collections.map((collection) => {
        const row = collection.byHost?.get?.(host)
        return metricValue(row?.[metric])
      }),
      markPoint: {
        symbol: 'pin', symbolSize: 42, label: { formatter: 'MAX', fontSize: 9 }, data: [{ type: 'max', name: `${host} max` }],
      },
      markLine: index === 0 && peakLines.length ? {
        symbol: ['none', 'none'],
        lineStyle: { type: 'dashed', width: 1.5 },
        data: peakLines,
      } : undefined,
    }))
    return {
      animationDuration: 250,
      backgroundColor: 'transparent',
      textStyle: { color: '#c8d7dc' },
      legend: { top: 0, type: 'scroll', textStyle: { color: '#a9bbc1' } },
      grid: { left: 58, right: 34, top: 52, bottom: 72 },
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'cross' },
        formatter: (items = []) => {
          if (!items.length) return ''
          const collection = collections[items[0]?.dataIndex]
          const title = `<b>${items[0].axisValue}</b>${collection?.endTime && collection.endTime !== collection.timeLabel ? `<br/><span>${collection.endTime}</span>` : ''}`
          const body = items.filter((item) => item.value !== null && item.value !== undefined).map((item) => `${item.marker}${item.seriesName}: <b>${Number(item.value).toFixed(meta.digits)}${meta.suffix}</b>`).join('<br/>')
          return `${title}<br/>${body}`
        },
      },
      xAxis: { type: 'category', boundaryGap: false, data: times, axisLabel: { color: '#81979f', hideOverlap: true }, axisLine: { lineStyle: { color: '#2a3b40' } } },
      yAxis: { type: 'value', name: meta.label, nameTextStyle: { color: '#81979f' }, axisLabel: { color: '#81979f', formatter: (value) => `${value}${meta.suffix}` }, splitLine: { lineStyle: { color: '#183036', type: 'dashed' } } },
      dataZoom: [{ type: 'inside', filterMode: 'none' }, { type: 'slider', bottom: 18, height: 18, borderColor: '#294047', fillerColor: 'rgba(49,199,207,.16)', textStyle: { color: '#81979f' } }],
      series,
    }
  }, [collections, rca?.hosts, rca?.resourceLandscapePeak?.timeLabel, rca?.operationalLandscapePeak?.timeLabel, rca?.landscapePeak?.timeLabel, meta.digits, meta.label, meta.suffix, metric])

  const click = React.useCallback((params) => {
    const collection = collections[params?.dataIndex]
    if (collection?.key) onSelectCollection?.(collection.key)
    if (collection?.timeLabel) onSelectTime?.(collection.timeLabel)
  }, [collections, onSelectCollection, onSelectTime])
  const ref = useEChart(option, click)
  return <div ref={ref} className="logV2LandscapeChart" role="img" aria-label={`${meta.label} timeline across logical application-server collections`} />
}

function legacyWorkloadRows(records = []) {
  const grouped = new Map()
  records.forEach((row) => {
    const key = row.timeLabel || row.snapshot
    if (!key) return
    const current = grouped.get(key) || { time: key, cpuValues: [], rssValues: [], pids: new Set(), d: 0, errors: new Set() }
    const cpu = metricValue(row.cpu); const rss = metricValue(row.rssGb)
    if (cpu !== null) current.cpuValues.push(cpu)
    if (rss !== null) current.rssValues.push(rss)
    if (row.pid) current.pids.add(row.pid)
    if (String(row.state || '').toUpperCase() === 'D') current.d += 1
    if (row.errorCode && row.errorCode !== '?') current.errors.add(row.errorCode)
    grouped.set(key, current)
  })
  return Array.from(grouped.values()).map((row) => ({
    time: row.time,
    cpu: row.cpuValues.length ? row.cpuValues.reduce((sum, value) => sum + value, 0) : null,
    rss: row.rssValues.length ? row.rssValues.reduce((sum, value) => sum + value, 0) : null,
    maxPidRss: row.rssValues.length ? Math.max(...row.rssValues) : null,
    pids: row.pids.size,
    d: row.d,
    errors: Array.from(row.errors),
  })).sort((a, b) => String(a.time).localeCompare(String(b.time)))
}

export function WorkloadTrendEChart({ records = [], targetTime = '', targetCollectionKey = '', aggregated = false }) {
  const option = React.useMemo(() => {
    const rows = aggregated
      ? records.map((row) => ({ time: row.collectionTime || row.timeLabel || row.snapshot, collectionKey: row.collectionKey, cpu: metricValue(row.cpu), rss: metricValue(row.rssGb), maxPidRss: metricValue(row.maxPidRssGb), pids: Number(row.concurrentPids || 0), d: Number(row.dState || 0), errors: row.errors || [] })).sort((a, b) => String(a.time).localeCompare(String(b.time)))
      : legacyWorkloadRows(records)
    const targetSample = targetCollectionKey ? rows.find((row) => row.collectionKey === targetCollectionKey) : null
    const markerTime = targetSample?.time || (rows.some((row) => row.time === targetTime) ? targetTime : '')
    return {
      animationDuration: 200,
      backgroundColor: 'transparent',
      textStyle: { color: '#c8d7dc' },
      legend: { top: 0, textStyle: { color: '#a9bbc1' } },
      grid: { left: 52, right: 58, top: 42, bottom: 62 },
      tooltip: {
        trigger: 'axis',
        formatter: (items = []) => {
          const row = rows[items[0]?.dataIndex] || {}
          const cpu = row.cpu === null ? '—' : `${Number(row.cpu).toFixed(1)}%`
          const maxPidRss = row.maxPidRss === null ? '—' : `${Number(row.maxPidRss).toFixed(2)} GB`
          const rss = row.rss === null ? '—' : `${Number(row.rss).toFixed(2)} GB`
          return `<b>${row.time || ''}</b><br/>CPU Σ ${cpu}<br/>Max PID RSS ${maxPidRss}<br/>ΣRSS upper bound ${rss}<br/>Concurrent PIDs ${row.pids || 0}<br/>D-state ${row.d || 0}<br/>Errors ${(row.errors || []).join(', ') || 'None'}`
        },
      },
      xAxis: { type: 'category', data: rows.map((row) => row.time), axisLabel: { color: '#81979f', hideOverlap: true } },
      yAxis: [
        { type: 'value', name: 'CPU Σ %', axisLabel: { color: '#81979f' }, splitLine: { lineStyle: { color: '#183036', type: 'dashed' } } },
        { type: 'value', name: 'RSS GB', axisLabel: { color: '#81979f' }, splitLine: { show: false } },
      ],
      dataZoom: [{ type: 'inside', filterMode: 'none' }, { type: 'slider', bottom: 12, height: 16, filterMode: 'none' }],
      series: [
        { name: 'CPU Σ', type: 'line', yAxisIndex: 0, connectNulls: false, showSymbol: rows.length <= 35, data: rows.map((row) => row.cpu), markLine: markerTime ? { silent: true, symbol: ['none', 'none'], data: [{ xAxis: markerTime, name: 'Incident' }], label: { formatter: 'INCIDENT', color: '#c3d0d4', backgroundColor: '#24343a', borderColor: '#3b5158', borderWidth: 1, borderRadius: 3, padding: [3, 5], fontSize: 9 }, lineStyle: { type: 'dashed', color: '#7f969e' } } : undefined },
        { name: 'Max PID RSS', type: 'line', yAxisIndex: 1, connectNulls: false, showSymbol: rows.length <= 35, data: rows.map((row) => row.maxPidRss) },
        { name: 'ΣRSS upper bound', type: 'line', yAxisIndex: 1, connectNulls: false, showSymbol: false, lineStyle: { type: 'dashed' }, data: rows.map((row) => row.rss) },
      ],
    }
  }, [records, targetTime, targetCollectionKey, aggregated])
  const ref = useEChart(option)
  return <div ref={ref} className="logV2WorkloadChart" role="img" aria-label="Selected workload incident-relative CPU and memory trend" />
}

export const LOG_V2_METRICS = METRICS
