import React from 'react'
import * as echarts from 'echarts'

const METRICS = {
  cpuPct: { label: 'CPU', suffix: '%', digits: 1 },
  memoryPct: { label: 'RAM', suffix: '%', digits: 1 },
  loadRatio: { label: 'Load / vCPU', suffix: '', digits: 2 },
  swapIn: { label: 'Swap In', suffix: ' p/s', digits: 0 },
  wpCritical: { label: 'WP Critical', suffix: '', digits: 0 },
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

export function LandscapeResourceEChart({ rca, metric = 'memoryPct', onSelectTime }) {
  const meta = METRICS[metric] || METRICS.memoryPct
  const option = React.useMemo(() => {
    const times = rca?.collections?.map((row) => row.timeLabel) || []
    const hosts = rca?.hosts || []
    const series = hosts.map((host, index) => ({
      name: host,
      type: 'line',
      showSymbol: times.length <= 40,
      symbolSize: 6,
      connectNulls: false,
      emphasis: { focus: 'series' },
      data: (rca?.collections || []).map((collection) => {
        const row = collection.byHost?.get?.(host)
        const value = row?.[metric]
        return Number.isFinite(Number(value)) ? Number(value) : null
      }),
      markPoint: {
        symbol: 'pin',
        symbolSize: 42,
        label: { formatter: 'MAX', fontSize: 9 },
        data: [{ type: 'max', name: `${host} peak` }],
      },
      markLine: index === 0 && rca?.landscapePeak?.timeLabel ? {
        symbol: ['none', 'none'],
        label: { formatter: `Landscape peak\n${rca.landscapePeak.timeLabel}`, position: 'insideEndTop' },
        lineStyle: { type: 'dashed', width: 1.5 },
        data: [{ xAxis: rca.landscapePeak.timeLabel }],
      } : undefined,
    }))
    return {
      animationDuration: 250,
      backgroundColor: 'transparent',
      textStyle: { color: '#c8d7dc' },
      legend: { top: 0, type: 'scroll', textStyle: { color: '#a9bbc1' } },
      grid: { left: 58, right: 34, top: 52, bottom: 72 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter: (items = []) => {
          if (!items.length) return ''
          const title = `<b>${items[0].axisValue}</b>`
          const body = items.filter((item) => item.value !== null && item.value !== undefined).map((item) => `${item.marker}${item.seriesName}: <b>${Number(item.value).toFixed(meta.digits)}${meta.suffix}</b>`).join('<br/>')
          return `${title}<br/>${body}`
        },
      },
      xAxis: { type: 'category', boundaryGap: false, data: times, axisLabel: { color: '#81979f', hideOverlap: true }, axisLine: { lineStyle: { color: '#2a3b40' } } },
      yAxis: { type: 'value', name: meta.label, nameTextStyle: { color: '#81979f' }, axisLabel: { color: '#81979f', formatter: (value) => `${value}${meta.suffix}` }, splitLine: { lineStyle: { color: '#183036', type: 'dashed' } } },
      dataZoom: [{ type: 'inside', filterMode: 'none' }, { type: 'slider', bottom: 18, height: 18, borderColor: '#294047', fillerColor: 'rgba(49,199,207,.16)', textStyle: { color: '#81979f' } }],
      series,
    }
  }, [rca, metric, meta.digits, meta.label, meta.suffix])
  const click = React.useCallback((params) => {
    if (params?.name) onSelectTime?.(String(params.name))
  }, [onSelectTime])
  const ref = useEChart(option, click)
  return <div ref={ref} className="logV2LandscapeChart" role="img" aria-label={`${meta.label} timeline across application servers`} />
}

export function WorkloadTrendEChart({ records = [], hostPeakTime = '' }) {
  const option = React.useMemo(() => {
    const grouped = new Map()
    records.forEach((row) => {
      const key = row.timeLabel || row.snapshot
      if (!key) return
      const current = grouped.get(key) || { time: key, cpu: 0, rss: 0, pids: new Set(), d: 0, errors: new Set() }
      if (Number.isFinite(Number(row.cpu))) current.cpu += Number(row.cpu)
      if (Number.isFinite(Number(row.rssGb))) current.rss += Number(row.rssGb)
      if (row.pid) current.pids.add(row.pid)
      if (String(row.state || '').toUpperCase() === 'D') current.d += 1
      if (row.errorCode && row.errorCode !== '?') current.errors.add(row.errorCode)
      grouped.set(key, current)
    })
    const rows = Array.from(grouped.values()).sort((a, b) => String(a.time).localeCompare(String(b.time)))
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
          return `<b>${row.time || ''}</b><br/>CPU ${Number(row.cpu || 0).toFixed(1)}%<br/>RSS ${Number(row.rss || 0).toFixed(2)} GB<br/>PIDs ${row.pids?.size || 0}<br/>D-state ${row.d || 0}<br/>Errors ${Array.from(row.errors || []).join(', ') || 'None'}`
        },
      },
      xAxis: { type: 'category', data: rows.map((row) => row.time), axisLabel: { color: '#81979f', hideOverlap: true } },
      yAxis: [
        { type: 'value', name: 'CPU %', axisLabel: { color: '#81979f' }, splitLine: { lineStyle: { color: '#183036', type: 'dashed' } } },
        { type: 'value', name: 'RSS GB', axisLabel: { color: '#81979f' }, splitLine: { show: false } },
      ],
      dataZoom: [{ type: 'inside' }, { type: 'slider', bottom: 12, height: 16 }],
      series: [
        { name: 'CPU', type: 'line', yAxisIndex: 0, showSymbol: rows.length <= 35, data: rows.map((row) => Number(row.cpu.toFixed(3))), markLine: hostPeakTime ? { symbol: ['none', 'none'], data: [{ xAxis: hostPeakTime, name: 'Host peak' }], label: { formatter: 'Host peak' }, lineStyle: { type: 'dashed' } } : undefined },
        { name: 'RSS', type: 'line', yAxisIndex: 1, showSymbol: rows.length <= 35, data: rows.map((row) => Number(row.rss.toFixed(3))) },
      ],
    }
  }, [records, hostPeakTime])
  const ref = useEChart(option)
  return <div ref={ref} className="logV2WorkloadChart" role="img" aria-label="Selected workload CPU and RSS trend" />
}

export const LOG_V2_METRICS = METRICS
