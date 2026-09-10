from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly 1 match, got {count}')
    p.write_text(text.replace(old, new, 1))


Path('src/tools/logSampleDrilldown.js').write_text(r'''const numberValue = (value, fallback = -1) => {
  if (value === null || value === undefined || value === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function sampleConsumerMemory(row = {}) {
  return row.targetPssGb ?? row.targetRss ?? row.targetMaxPidRss ?? row.peakRss ?? row.peakMaxPidRss ?? null
}

const DRILLDOWN = {
  cpuPct: { sortId: 'cpuValue', title: 'Top CPU Consumers', kicker: 'CPU SAMPLE DRILLDOWN', hostLabel: 'Host CPU', hostNote: 'application server CPU', contributorLabel: 'Process CPU', contributorDigits: 1, contributorSuffix: '%', description: 'ranked by process CPU at the selected sample' },
  memoryPct: { sortId: 'memory', title: 'Top Memory Consumers', kicker: 'RAM SAMPLE DRILLDOWN', hostLabel: 'Host RAM', hostNote: 'application server memory usage', contributorLabel: 'Process Memory', contributorDigits: 2, contributorSuffix: ' GB', description: 'ranked by process RSS/PSS at the selected sample' },
  resourceLoadRatio: { sortId: 'dState', title: 'Top Load Contributors', kicker: 'LOAD SAMPLE DRILLDOWN', hostLabel: 'Host Load1/vCPU', hostNote: 'host-level load signal', contributorLabel: 'D-State WP', contributorDigits: 0, contributorSuffix: '', description: 'ranked by D-State first, then process CPU; host load is not 1:1 attributable to one process' },
  swapIn: { sortId: 'memory', title: 'Top Swap Contributors', kicker: 'SWAP SAMPLE DRILLDOWN', hostLabel: 'Host Swap In', hostNote: 'host-level swap-in activity', contributorLabel: 'Process Memory', contributorDigits: 2, contributorSuffix: ' GB', description: 'ranked by process memory; swap-in is a host-level pressure signal' },
  iowaitPct: { sortId: 'dState', title: 'Top I/O Wait Contributors', kicker: 'I/O WAIT SAMPLE DRILLDOWN', hostLabel: 'Host CPU iowait', hostNote: 'host-level I/O wait', contributorLabel: 'D-State WP', contributorDigits: 0, contributorSuffix: '', description: 'ranked by D-State first, then process CPU; iowait is a host-level signal' },
  psiMemoryFull10: { sortId: 'memory', title: 'Top Memory Pressure Contributors', kicker: 'MEMORY PSI SAMPLE DRILLDOWN', hostLabel: 'Host PSI Mem Full', hostNote: 'host-level memory pressure', contributorLabel: 'Process Memory', contributorDigits: 2, contributorSuffix: ' GB', description: 'ranked by process memory at the selected sample' },
  psiIoFull10: { sortId: 'dState', title: 'Top I/O Pressure Contributors', kicker: 'I/O PSI SAMPLE DRILLDOWN', hostLabel: 'Host PSI IO Full', hostNote: 'host-level I/O pressure', contributorLabel: 'D-State WP', contributorDigits: 0, contributorSuffix: '', description: 'ranked by D-State first, then process CPU at the selected sample' },
  wpCritical: { sortId: 'dState', title: 'Top Critical WP Contributors', kicker: 'WP CRITICAL SAMPLE DRILLDOWN', hostLabel: 'Host WP Critical', hostNote: 'critical work processes on the host', contributorLabel: 'D-State WP', contributorDigits: 0, contributorSuffix: '', description: 'ranked by D-State work processes, then process CPU' },
}

export function drilldownMeta(metric = 'cpuPct') {
  return DRILLDOWN[metric] || DRILLDOWN.cpuPct
}

export function sampleConsumerContribution(row = {}, metric = 'cpuPct') {
  const sortId = drilldownMeta(metric).sortId
  if (sortId === 'memory') return sampleConsumerMemory(row)
  if (sortId === 'dState') return row.targetDState ?? row.dStateHits ?? null
  return row.targetCpu ?? row.peakCpu ?? null
}

export function sortSampleConsumers(rows = [], metric = 'cpuPct') {
  const sortId = drilldownMeta(metric).sortId
  const cpu = (row) => numberValue(row.targetCpu ?? row.peakCpu)
  const memory = (row) => numberValue(sampleConsumerMemory(row))
  const dState = (row) => numberValue(row.targetDState ?? row.dStateHits, 0)
  return [...rows].sort((a, b) => {
    if (sortId === 'memory') return memory(b) - memory(a) || cpu(b) - cpu(a) || dState(b) - dState(a)
    if (sortId === 'dState') return dState(b) - dState(a) || cpu(b) - cpu(a) || memory(b) - memory(a)
    return cpu(b) - cpu(a) || memory(b) - memory(a) || dState(b) - dState(a)
  })
}
''')

Path('src/tools/__tests__/logSampleDrilldown.test.js').write_text(r'''import { describe, expect, it } from 'vitest'
import { drilldownMeta, sampleConsumerContribution, sampleConsumerMemory, sortSampleConsumers } from '../logSampleDrilldown.js'

const rows = [
  { key: 'cpu', targetCpu: 95, targetRss: 1.5, targetDState: 0 },
  { key: 'memory', targetCpu: 35, targetRss: 8.2, targetDState: 0 },
  { key: 'blocked', targetCpu: 10, targetRss: 2.1, targetDState: 4 },
]

describe('metric-aware LOG sample drilldown', () => {
  it('ranks CPU and RAM by metric-relevant process evidence', () => {
    expect(sortSampleConsumers(rows, 'cpuPct').map((row) => row.key)).toEqual(['cpu', 'memory', 'blocked'])
    expect(sortSampleConsumers(rows, 'memoryPct').map((row) => row.key)).toEqual(['memory', 'blocked', 'cpu'])
  })

  it('uses D-State first for load, iowait and WP critical contributor ranking', () => {
    expect(sortSampleConsumers(rows, 'resourceLoadRatio')[0].key).toBe('blocked')
    expect(sortSampleConsumers(rows, 'iowaitPct')[0].key).toBe('blocked')
    expect(sortSampleConsumers(rows, 'wpCritical')[0].key).toBe('blocked')
  })

  it('uses memory evidence for RAM, swap and memory pressure', () => {
    expect(drilldownMeta('swapIn').sortId).toBe('memory')
    expect(drilldownMeta('psiMemoryFull10').sortId).toBe('memory')
    expect(sampleConsumerMemory(rows[1])).toBe(8.2)
    expect(sampleConsumerContribution(rows[1], 'memoryPct')).toBe(8.2)
  })
})
''')

tool = 'src/tools/ToolLogAutoSphereV5.jsx'
replace_once(tool, "import { LOG_V14_METRICS } from './components/logChartMetrics.js'\n", "import { LOG_V14_METRICS } from './components/logChartMetrics.js'\nimport { drilldownMeta, sampleConsumerContribution, sortSampleConsumers } from './logSampleDrilldown.js'\n")
replace_once(tool, "function scopedConsumerRows(rows = [], focus = null) {\n  if (!focus?.host || !focus?.collectionKey) return []\n  return rows.flatMap((row) => {", "function scopedConsumerRows(rows = [], focus = null) {\n  if (!focus?.host || !focus?.collectionKey) return []\n  const scoped = rows.flatMap((row) => {")
replace_once(tool, "  }).sort((a, b) => Number(b.targetCpu ?? -1) - Number(a.targetCpu ?? -1) || Number(consumerMemory(b) ?? -1) - Number(consumerMemory(a) ?? -1))\n}\n\nfunction SampleDrilldownSummary", "  })\n  return sortSampleConsumers(scoped, focus.metric)\n}\n\nfunction SampleDrilldownSummary")

old_summary = r'''function SampleDrilldownSummary({ focus, rows = [], onClear }) {
  if (!focus) return null
  const top = rows[0] || null
  return <section className="logV2Panel logV141Summary">
    <div className="logV141SummaryTop">
      <div><span className="logV141Kicker">CPU SAMPLE DRILLDOWN</span><h2>{focus.host} · {shortTime(focus.timeLabel)}</h2></div>
      <div className="logV2QuickFilters"><button type="button" onClick={onClear}>Full period</button></div>
    </div>
    <div className="logV141SummaryGrid logV141SummaryGridCompact">
      <div><span>Host CPU</span><strong>{metricText(focus.value, 1, '%')}</strong><small>application server CPU</small></div>
      <div><span>Top Consumer</span><strong>{top?.workload || '—'}</strong><small>{top?.program || '—'}</small></div>
      <div><span>Process CPU</span><strong>{metricText(top?.targetCpu, 1, '%')}</strong><small>at selected sample</small></div>
      <div><span>WP Type</span><strong>{top?.type || '—'}</strong><small>{rows.length} consumers observed</small></div>
    </div>
  </section>
}'''
new_summary = r'''function SampleDrilldownSummary({ focus, rows = [], onClear }) {
  if (!focus) return null
  const top = rows[0] || null
  const presentation = drilldownMeta(focus.metric)
  const hostMetric = LOG_V14_METRICS[focus.metric] || LOG_V14_METRICS.cpuPct
  const contribution = top ? sampleConsumerContribution(top, focus.metric) : null
  return <section className="logV2Panel logV141Summary">
    <div className="logV141SummaryTop">
      <div><span className="logV141Kicker">{presentation.kicker}</span><h2>{focus.host} · {shortTime(focus.timeLabel)}</h2></div>
      <div className="logV2QuickFilters"><button type="button" onClick={onClear}>Full period</button></div>
    </div>
    <div className="logV141SummaryGrid logV141SummaryGridCompact">
      <div><span>{presentation.hostLabel}</span><strong>{metricText(focus.value, hostMetric.digits, hostMetric.suffix)}</strong><small>{presentation.hostNote}</small></div>
      <div><span>Top Contributor</span><strong>{top?.workload || '—'}</strong><small>{top?.program || '—'}</small></div>
      <div><span>{presentation.contributorLabel}</span><strong>{metricText(contribution, presentation.contributorDigits, presentation.contributorSuffix)}</strong><small>at selected sample</small></div>
      <div><span>WP Type</span><strong>{top?.type || '—'}</strong><small>{rows.length} consumers observed</small></div>
    </div>
  </section>
}'''
replace_once(tool, old_summary, new_summary)
replace_once(tool, "  const focusedRows = React.useMemo(() => scopedConsumerRows(resourceRows, sampleFocus), [resourceRows, sampleFocus])\n  const consumerRows = sampleFocus ? focusedRows : resourceRows\n  const consumerPointInTime = pointInTime || Boolean(sampleFocus)\n", "  const focusedRows = React.useMemo(() => scopedConsumerRows(resourceRows, sampleFocus), [resourceRows, sampleFocus])\n  const consumerRows = sampleFocus ? focusedRows : resourceRows\n  const consumerPointInTime = pointInTime || Boolean(sampleFocus)\n  const samplePresentation = sampleFocus ? drilldownMeta(sampleFocus.metric) : null\n  const consumerSortId = samplePresentation?.sortId || 'cpuValue'\n  const consumerSortResetKey = sampleFocus ? `${sampleFocus.metric}:${sampleFocus.host}:${sampleFocus.collectionKey}` : (pointInTime ? selectedCollectionKey : 'full-period')\n")
old_handler = r'''  const handleTrendPoint = React.useCallback((point) => {
    if (!point?.collectionKey) return
    setSelectedCollectionKey(point.collectionKey)
    if (point.host) setSelectedHost(point.host)
    if (point.metric !== 'cpuPct' || !point.host) return
    setSampleFocus(point)
    const scoped = scopedConsumerRows(resourceRows, point)
    if (scoped[0]) setSelectedResource(scoped[0])
    requestAnimationFrame(() => document.getElementById('top-resource-consumers')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [resourceRows])'''
new_handler = r'''  const handleTrendPoint = React.useCallback((point) => {
    if (!point?.collectionKey) return
    setSelectedCollectionKey(point.collectionKey)
    if (point.host) setSelectedHost(point.host)
    if (!point.host) return
    setSampleFocus(point)
    const scoped = scopedConsumerRows(resourceRows, point)
    if (scoped[0]) setSelectedResource(scoped[0])
    requestAnimationFrame(() => document.getElementById('top-resource-consumers')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [resourceRows])'''
replace_once(tool, old_handler, new_handler)
replace_once(tool, "<div className=\"logV2PanelHead\"><div><h2>Application Server Trend</h2><p>{metric === 'cpuPct' ? 'Click a CPU point to inspect consumers on that server at that sample.' : 'Resource trend by log timestamp.'}</p></div><div className=\"logV2MetricTabs\">{visibleMetrics.map(([key, item]) => <button key={key} type=\"button\" className={metric === key ? 'active' : ''} onClick={() => { setMetric(key); if (key !== 'cpuPct' && sampleFocus) clearSampleFocus() }}>{item.label}</button>)}</div></div>", "<div className=\"logV2PanelHead\"><div><h2>Application Server Trend</h2><p>Click any point or MAX marker to inspect metric-relevant contributors on that server at that sample.</p></div><div className=\"logV2MetricTabs\">{visibleMetrics.map(([key, item]) => <button key={key} type=\"button\" className={metric === key ? 'active' : ''} onClick={() => { setMetric(key); if (sampleFocus) clearSampleFocus() }}>{item.label}</button>)}</div></div>")
replace_once(tool, "<div className=\"logV2PanelHead\"><div><h2>{sampleFocus ? `Top CPU Consumers · ${sampleFocus.host}` : 'Top Resource Consumers'}</h2><p>{sampleFocus ? `Processes observed at ${shortTime(sampleFocus.timeLabel)}. CPU values are process CPU at the selected sample.` : pointInTime ? 'Jobs and ABAP programs observed in this collection.' : 'Jobs and ABAP programs observed across the selected period.'}</p></div>{sampleFocus ? <div className=\"logV2QuickFilters\"><button type=\"button\" onClick={clearSampleFocus}>Full period</button></div> : null}</div>", "<div className=\"logV2PanelHead\"><div><h2>{sampleFocus ? `${samplePresentation.title} · ${sampleFocus.host}` : 'Top Resource Consumers'}</h2><p>{sampleFocus ? `${shortTime(sampleFocus.timeLabel)} · ${samplePresentation.description}.` : pointInTime ? 'Jobs and ABAP programs observed in this collection.' : 'Jobs and ABAP programs observed across the selected period.'}</p></div>{sampleFocus ? <div className=\"logV2QuickFilters\"><button type=\"button\" onClick={clearSampleFocus}>Full period</button></div> : null}</div>")
replace_once(tool, "<VirtualResourceTableV14 rows={consumerRows} selectedKey={selectedResource?.key || ''} onSelect={setSelectedResource} pointInTime={consumerPointInTime} />", "<VirtualResourceTableV14 rows={consumerRows} selectedKey={selectedResource?.key || ''} onSelect={setSelectedResource} pointInTime={consumerPointInTime} initialSortId={consumerSortId} sortResetKey={consumerSortResetKey} />")

table = 'src/tools/components/VirtualResourceTableV14.jsx'
replace_once(table, "  if (pointInTime) return row.targetPssGb ?? row.targetMaxPidRss ?? null", "  if (pointInTime) return row.targetPssGb ?? row.targetRss ?? row.targetMaxPidRss ?? null")
replace_once(table, "export default function VirtualResourceTableV14({ rows = [], selectedKey = '', onSelect, pointInTime = false }) {\n  const [sorting, setSorting] = React.useState([{ id: 'cpuValue', desc: true }])", "export default function VirtualResourceTableV14({ rows = [], selectedKey = '', onSelect, pointInTime = false, initialSortId = 'cpuValue', sortResetKey = '' }) {\n  const normalizedSortId = ['cpuValue', 'memory', 'dState'].includes(initialSortId) ? initialSortId : 'cpuValue'\n  const [sorting, setSorting] = React.useState([{ id: normalizedSortId, desc: true }])")
replace_once(table, "  React.useEffect(() => {\n    setSorting([{ id: 'cpuValue', desc: true }])\n    setQuickFilter('ALL')\n  }, [pointInTime])", "  React.useEffect(() => {\n    setSorting([{ id: normalizedSortId, desc: true }])\n    setQuickFilter('ALL')\n  }, [pointInTime, normalizedSortId, sortResetKey])")
replace_once(table, "  const bodyRef = React.useRef(null)\n  const tableRows = table.getRowModel().rows", "  const bodyRef = React.useRef(null)\n  const tableRows = table.getRowModel().rows\n  const activeSortId = sorting[0]?.id || normalizedSortId\n  const activeSortLabel = activeSortId === 'memory' ? (pointInTime ? 'memory' : 'peak memory') : activeSortId === 'dState' ? (pointInTime ? 'D-State WP' : 'D-State hits') : (pointInTime ? 'CPU' : 'peak CPU')")
replace_once(table, "<span><b>{tableRows.length}</b> consumers · sorted by {pointInTime ? 'CPU' : 'peak CPU'}</span>", "<span><b>{tableRows.length}</b> consumers · sorted by {activeSortLabel}</span>")

chart = 'src/tools/components/LogLandscapeEChartV14.jsx'
replace_once(chart, "cursor: metric === 'cpuPct' ? 'pointer' : 'default',", "cursor: 'pointer',")
replace_once(chart, "symbolSize: metric === 'cpuPct' ? 9 : 6,", "symbolSize: 9,")
replace_once(chart, "const hint = metric === 'cpuPct' ? '<br/><span style=\"opacity:.72\">Click a CPU point or MAX marker to inspect consumers</span>' : ''", "const hint = '<br/><span style=\"opacity:.72\">Click a point or MAX marker to inspect metric-relevant contributors</span>'")

print('metric-aware LOG MAX drilldown patch applied')
