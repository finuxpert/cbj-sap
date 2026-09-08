import React from 'react'
import * as echarts from './logEcharts.js'
import { LOG_V14_METRICS as METRICS } from './logChartMetrics.js'
export { WorkloadTrendEChart } from './LogLandscapeEChart.jsx'

const metricValue = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function shortStamp(value = '') {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2})/)
  return match ? `${match[2]}-${match[3]} ${match[4]}` : String(value || '')
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

export function LandscapeResourceEChartV14({ rca, metric = 'memoryPct', onSelectCollection, onSelectPoint }) {
  const meta = METRICS[metric] || METRICS.memoryPct
  const collections = rca?.collections || []
  const option = React.useMemo(() => {
    const times = collections.map((row) => row.timeLabel)
    const hosts = rca?.hosts || []
    const resourcePeak = rca?.resourceLandscapePeak || rca?.landscapePeak || null
    const resourceAxisCollection = collections.find((row) => row.key === resourcePeak?.key)
    const resourceAxisTime = resourceAxisCollection?.timeLabel || resourcePeak?.timeLabel || ''
    const resourceActualTime = resourcePeak?.incidentAnchorTime || rca?.resourceIncidentAnchor?.time || resourcePeak?.timeLabel || ''
    const resourceAnchorHost = rca?.resourceIncidentAnchor?.host || resourcePeak?.incidentAnchorHost || ''
    const incidentLine = resourceAxisTime ? [{
      xAxis: resourceAxisTime,
      name: 'Incident',
      label: {
        formatter: 'INCIDENT',
        position: 'insideEndTop',
        rotate: 0,
        color: '#e6edef',
        backgroundColor: '#24343a',
        borderColor: '#3b5158',
        borderWidth: 1,
        borderRadius: 3,
        padding: [3, 5],
        fontSize: 9,
        lineHeight: 11,
      },
      lineStyle: { type: 'dashed', width: 1.5, color: '#7f969e' },
    }] : []
    const series = hosts.map((host, index) => ({
      name: host,
      type: 'line',
      showSymbol: times.length <= 40,
      symbolSize: 6,
      connectNulls: false,
      emphasis: { focus: 'series' },
      data: collections.map((collection) => metricValue(collection.byHost?.get?.(host)?.[metric])),
      markPoint: { symbol: 'pin', symbolSize: 42, label: { formatter: 'MAX', fontSize: 9 }, data: [{ type: 'max', name: `${host} max` }] },
      markLine: index === 0 && incidentLine.length ? { silent: true, symbol: ['none', 'none'], data: incidentLine } : undefined,
    }))
    return {
      animationDuration: 220,
      backgroundColor: 'transparent',
      textStyle: { color: '#c8d7dc' },
      legend: { top: 0, type: 'scroll', textStyle: { color: '#a9bbc1' } },
      grid: { left: 58, right: 34, top: 52, bottom: 72 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter: (items = []) => {
          if (!items.length) return ''
          const collection = collections[items[0]?.dataIndex]
          const incident = collection?.key === resourcePeak?.key
          const title = `<b>${items[0].axisValue}</b>${collection?.endTime && collection.endTime !== collection.timeLabel ? `<br/><span>${collection.endTime}</span>` : ''}${incident ? `<br/><span>Incident: ${resourceAnchorHost || 'host unknown'} · ${shortStamp(resourceActualTime)}</span>` : ''}`
          const body = items.filter((item) => item.value !== null && item.value !== undefined).map((item) => `${item.marker}${item.seriesName}: <b>${Number(item.value).toFixed(meta.digits)}${meta.suffix}</b>`).join('<br/>')
          return `${title}<br/>${body || 'No metric evidence'}`
        },
      },
      xAxis: { type: 'category', boundaryGap: false, data: times, axisLabel: { color: '#81979f', hideOverlap: true }, axisLine: { lineStyle: { color: '#2a3b40' } } },
      yAxis: { type: 'value', name: meta.label, nameTextStyle: { color: '#81979f' }, axisLabel: { color: '#81979f', formatter: (value) => `${value}${meta.suffix}` }, splitLine: { lineStyle: { color: '#183036', type: 'dashed' } } },
      dataZoom: [{ type: 'inside', filterMode: 'none' }, { type: 'slider', bottom: 18, height: 18, borderColor: '#294047', fillerColor: 'rgba(49,199,207,.16)', textStyle: { color: '#81979f' } }],
      series,
    }
  }, [collections, rca?.hosts, rca?.resourceLandscapePeak, rca?.landscapePeak, rca?.resourceIncidentAnchor, metric, meta.digits, meta.label, meta.suffix])

  const click = React.useCallback((params) => {
    if (params?.componentType !== 'series' || !Number.isInteger(params?.dataIndex)) return
    const collection = collections[params.dataIndex]
    if (!collection?.key) return
    onSelectCollection?.(collection.key)
    onSelectPoint?.({
      collectionKey: collection.key,
      timeLabel: collection.timeLabel || '',
      endTime: collection.endTime || collection.timeLabel || '',
      host: params.seriesName || '',
      metric,
      value: metricValue(params.value),
      dataIndex: params.dataIndex,
    })
  }, [collections, metric, onSelectCollection, onSelectPoint])
  const ref = useEChart(option, click)
  return <div ref={ref} className="logV2LandscapeChart" role="img" aria-label={`${meta.label} timeline across logical application-server collections`} />
}

export const LOG_V14_METRICS = METRICS
