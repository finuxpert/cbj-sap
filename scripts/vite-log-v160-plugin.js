function mustReplace(code, oldText, newText, label) {
  if (!code.includes(oldText)) throw new Error(`[log-v160] ${label} source not found`)
  return code.replace(oldText, newText)
}

function transformLogView(input) {
  let code = input
  code = code.replace('label: `Episode ${index + 1}`,', 'label: `Window ${index + 1}`,')
  code = code.replace("label: 'No Incident'", "label: 'No Incident Window'")

  if (!code.includes('function evidenceGapSummary(')) {
    const anchor = '\nexport function hostRole'
    if (!code.includes(anchor)) throw new Error('[log-v160] hostRole anchor not found')
    const helpers = `

function evidenceGapSummary(rows = [], allTelemetry = [], host = '', gapThresholdMinutes = 30) {
  const ordered = [...rows].sort((a, b) => a.sortKey - b.sortKey)
  const foreign = (allTelemetry || []).filter((row) => row.host !== host).map((row) => ({ row, ms: rowTimestampMs(row) })).filter((item) => Number.isFinite(item.ms))
  const gaps = []
  ordered.slice(1).forEach((row, index) => {
    const previous = ordered[index]
    const minutes = minutesBetween(previous, row)
    if (!Number.isFinite(minutes) || minutes <= gapThresholdMinutes) return
    const startMs = rowTimestampMs(previous)
    const endMs = rowTimestampMs(row)
    const otherSamples = foreign.filter((item) => item.ms > startMs && item.ms < endMs)
    const otherHosts = Array.from(new Set(otherSamples.map((item) => item.row.host)))
    const type = otherSamples.length ? 'HOST_SPECIFIC' : 'COLLECTION'
    gaps.push({
      type,
      start: previous.timeLabel,
      end: row.timeLabel,
      minutes,
      otherHostSamples: otherSamples.length,
      otherHosts,
    })
  })
  return {
    count: gaps.length,
    collectionCount: gaps.filter((gap) => gap.type === 'COLLECTION').length,
    hostSpecificCount: gaps.filter((gap) => gap.type === 'HOST_SPECIFIC').length,
    longestMinutes: gaps.reduce((max, gap) => Math.max(max, gap.minutes), 0),
    gaps,
  }
}

function maxConcurrentImpact(rows = []) {
  const grouped = new Map()
  ;(rows || []).forEach((row) => {
    if (!grouped.has(row.timeLabel)) grouped.set(row.timeLabel, new Map())
    grouped.get(row.timeLabel).set(row.host, row)
  })
  const samples = Array.from(grouped.entries()).map(([timeLabel, byHost]) => {
    const values = Array.from(byHost.values())
    const crit = values.filter((row) => row.severity === 'CRIT').length
    const warn = values.filter((row) => row.severity === 'WARN').length
    const normal = values.filter((row) => row.severity === 'NORMAL').length
    return { timeLabel, crit, warn, normal, sampled: values.length, severity: crit ? 'CRIT' : warn ? 'WARN' : 'NORMAL' }
  }).sort((a, b) => b.crit - a.crit || b.warn - a.warn || b.sampled - a.sampled || String(a.timeLabel).localeCompare(String(b.timeLabel)))
  return samples[0] || { timeLabel: '—', crit: 0, warn: 0, normal: 0, sampled: 0, severity: 'NORMAL' }
}
`
    code = code.replace(anchor, helpers + anchor)
  }

  code = mustReplace(
    code,
    '  const { episodes: incidentEpisodes, cadence } = buildIncidentEpisodes(evidenceSnapshots)\n',
    '  const { episodes: incidentEpisodes, cadence } = buildIncidentEpisodes(evidenceSnapshots)\n  const evidenceGaps = evidenceGapSummary(evidenceSnapshots, analysis.telemetry || [], host, cadence.gapThresholdMinutes)\n',
    'incident cadence',
  )
  code = mustReplace(
    code,
    '  const landscape = landscapeTelemetry(analysis, displayTimes)\n',
    '  const landscape = landscapeTelemetry(analysis, displayTimes)\n  const landscapeConcurrent = maxConcurrentImpact(landscape)\n',
    'landscape telemetry',
  )
  code = mustReplace(
    code,
    '    incidentEpisodes, incidentFocus, incidentCadence: cadence, incidentEpisodeCounts: episodeCounts,\n',
    '    incidentEpisodes, incidentFocus, incidentCadence: cadence, incidentEpisodeCounts: episodeCounts, evidenceGaps, landscapeConcurrent,\n',
    'view return',
  )
  return code
}

function transformTool(input) {
  let code = input
  code = mustReplace(
    code,
    "  const landscapeOverview = view?.hostOverview || []\n  const landscapeCritCount = landscapeOverview.filter((row) => row.severity === 'CRIT').length\n  const landscapeWarnCount = landscapeOverview.filter((row) => row.severity === 'WARN').length\n  const landscapeSeverity = landscapeCritCount ? 'CRIT' : landscapeWarnCount ? 'WARN' : 'NORMAL'\n",
    "  const landscapeOverview = view?.hostOverview || []\n  const landscapeConcurrent = view?.landscapeConcurrent || { timeLabel: '—', crit: 0, warn: 0, normal: 0, sampled: 0, severity: 'NORMAL' }\n  const landscapeCritCount = Number(landscapeConcurrent.crit || 0)\n  const landscapeWarnCount = Number(landscapeConcurrent.warn || 0)\n  const landscapeSeverity = landscapeConcurrent.severity || (landscapeCritCount ? 'CRIT' : landscapeWarnCount ? 'WARN' : 'NORMAL')\n",
    'landscape scope',
  )
  code = mustReplace(
    code,
    "  const completenessText = completeness.isRegular ? `${completeness.intervalMinutes}-min interval` : completeness.observedIntervals?.length ? `Irregular: ${completeness.observedIntervals.join(', ')} min` : 'Interval metadata unavailable'\n",
    "  const cadenceMinutes = view?.incidentCadence?.nominalMinutes || completeness.intervalMinutes || 0\n  const completenessText = cadenceMinutes ? `${cadenceMinutes}-min cadence` : 'Cadence unavailable'\n  const evidenceGaps = view?.evidenceGaps || { count: 0, collectionCount: 0, hostSpecificCount: 0, gaps: [] }\n  const gapParts = [evidenceGaps.collectionCount ? `${evidenceGaps.collectionCount} collection gap${evidenceGaps.collectionCount === 1 ? '' : 's'}` : '', evidenceGaps.hostSpecificCount ? `${evidenceGaps.hostSpecificCount} host-specific gap${evidenceGaps.hostSpecificCount === 1 ? '' : 's'}` : ''].filter(Boolean)\n  const gapText = gapParts.length ? gapParts.join(' · ') : 'No large evidence gaps'\n",
    'cadence summary',
  )

  const replacements = [
    ['<span>Host Incident</span>', '<span>Incident Window</span>'],
    ['<option value="latest">Latest Host Incident</option>', '<option value="latest">Latest Incident Window</option>'],
    ['<option value="peak">Peak Host Incident</option>', '<option value="peak">Peak Pressure Window</option>'],
    ['Host Incident Episodes', 'Detected Incident Windows'],
    ['Selected Host Incident', 'Selected Incident Window'],
    ['All Host Incident Episode Errors', 'All Incident Window Errors'],
    ['Selected Host Incident Errors', 'Selected Incident Window Errors'],
    ['Selected Host Incident Snapshots', 'Selected Incident Window Snapshots'],
    ['Selected-host incident timing', 'Selected-host incident window timing'],
    ['Host Incident Scope', 'Incident Window Scope'],
    ['host incident episodes', 'incident windows'],
    ['incident episodes', 'incident windows'],
    ['incident episode', 'incident window'],
    ['host episodes', 'incident windows'],
  ]
  for (const [from, to] of replacements) code = code.split(from).join(to)

  code = code.replace(
    "<small>{episodes.length} incident window{episodes.length === 1 ? '' : 's'} · gap threshold {view?.incidentCadence?.gapThresholdMinutes || 30} min</small>",
    '<small>{gapText} · line breaks mean missing evidence, not downtime proof</small>',
  )
  code = code.replace(
    'meta={`${evidenceWindow.count || 0} snapshots · full uploaded scope`}',
    "meta={`${evidenceWindow.count || 0} snapshots · ${evidenceGaps.count ? `${evidenceGaps.count} evidence gaps` : 'continuous evidence'}`}",
  )

  const oldLandscapeMetric = '<Metric label="Landscape Impact" value={landscapeSeverity} meta={`${landscapeCritCount} CRIT · ${landscapeWarnCount} WARN · ${landscapeOverview.length} sampled hosts`} tone={landscapeSeverity === \'CRIT\' ? \'critical\' : landscapeSeverity === \'WARN\' ? \'warn\' : \'good\'} />'
  const newLandscapeMetric = '<Metric label="Landscape Concurrency" value={landscapeSeverity} meta={`${landscapeCritCount} CRIT · ${landscapeWarnCount} WARN · ${landscapeConcurrent.sampled || 0} sampled at ${compactTime(landscapeConcurrent.timeLabel || \'—\')}`} tone={landscapeSeverity === \'CRIT\' ? \'critical\' : landscapeSeverity === \'WARN\' ? \'warn\' : \'good\'} />'
  code = mustReplace(code, oldLandscapeMetric, newLandscapeMetric, 'landscape KPI')

  code = code.replace(
    'All evidence is shown; large collection gaps are intentionally disconnected.',
    'All evidence is shown. Line breaks mark evidence gaps and are not downtime proof.',
  )
  if (code.includes('<h2>Incident Signal Peaks</h2>')) {
    code = code.replace('<h2>Incident Signal Peaks</h2>', "<h2>{incident.isAggregate ? 'Evidence Resource Peaks' : 'Incident Resource Peaks'}</h2>")
  } else if (code.includes('<h2>Incident Resource Peaks</h2>')) {
    code = code.replace('<h2>Incident Resource Peaks</h2>', "<h2>{incident.isAggregate ? 'Evidence Resource Peaks' : 'Incident Resource Peaks'}</h2>")
  }
  code = code.replace('Threshold signals across the evidence window.', 'Resource peaks across the evidence window.')
  code = code.replace('Threshold signals inside the selected host incident scope.', 'Resource peaks inside the selected incident window.')
  code = code.replace('<span>Landscape Impact</span><b>{landscapeSeverity}</b>', '<span>Landscape Concurrency</span><b>{landscapeSeverity}</b>')
  return code
}

function transformLandscape(input) {
  let code = input
  const start = code.indexOf('  const impact = React.useMemo(() => {')
  const end = code.indexOf('\n\n  return <section', start)
  if (start < 0 || end < 0) throw new Error('[log-v160] landscape impact block not found')
  const impact = `  const impact = React.useMemo(() => {
    const concurrent = view?.landscapeConcurrent || { timeLabel: '—', crit: 0, warn: 0, normal: 0, sampled: 0, severity: 'NORMAL' }
    const atPeak = (view?.landscapeTelemetry || []).filter((row) => row.timeLabel === concurrent.timeLabel)
    const critHosts = atPeak.filter((row) => row.severity === 'CRIT').map((row) => row.host)
    const warnHosts = atPeak.filter((row) => row.severity === 'WARN').map((row) => row.host)
    return {
      severity: concurrent.severity || 'NORMAL',
      selectedHostSeverity: view?.severity || 'NORMAL',
      critHosts,
      warnHosts,
      sampledHosts: concurrent.sampled || atPeak.length,
      timeLabel: concurrent.timeLabel || '—',
    }
  }, [view?.landscapeConcurrent, view?.landscapeTelemetry, view?.severity])`
  code = code.slice(0, start) + impact + code.slice(end)
  code = code.replace(
    'Selected-host incident timing overlaid across application servers. Large evidence gaps are not connected.',
    'Selected incident-window timing across application servers. Line breaks are evidence gaps, not downtime proof.',
  )
  code = code.replace(
    '<span>Landscape Impact</span><b>{impact.severity}</b><small>Worst status in host incident window · {impact.critHosts.length} CRIT · {impact.warnHosts.length} WARN · {impact.sampledHosts} sampled</small>',
    '<span>Landscape Concurrency</span><b>{impact.severity}</b><small>Maximum simultaneous status at {compactLabel(impact.timeLabel)} · {impact.critHosts.length} CRIT · {impact.warnHosts.length} WARN · {impact.sampledHosts} sampled</small>',
  )
  return code
}

function transformLifecycle(code) {
  return code.replace('Selected host incident episode.', 'Selected incident window.')
}

export default function logSemanticsV160() {
  return {
    name: 'log-semantics-v160',
    enforce: 'pre',
    transform(code, id) {
      const path = id.split('?')[0].replaceAll('\\', '/')
      if (path.endsWith('/src/tools/logView2026.js')) return { code: transformLogView(code), map: null }
      if (path.endsWith('/src/tools/ToolLogAnalysis2026.jsx')) return { code: transformTool(code), map: null }
      if (path.endsWith('/src/tools/components/LogLandscapeCompare.jsx')) return { code: transformLandscape(code), map: null }
      if (path.endsWith('/src/tools/components/IncidentLifecycleInsights.jsx')) return { code: transformLifecycle(code), map: null }
      return null
    },
  }
}
