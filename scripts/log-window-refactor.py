from pathlib import Path


def must_replace(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Expected source not found in {path}: {old[:100]!r}")
    text = text.replace(old, new, count)
    p.write_text(text)


def replace_all(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old in text:
        p.write_text(text.replace(old, new))


log_view = 'src/tools/logView2026.js'
tool = 'src/tools/ToolLogAnalysis2026.jsx'
landscape = 'src/tools/components/LogLandscapeCompare.jsx'
lifecycle = 'src/tools/components/IncidentLifecycleInsights.jsx'
version = 'src/app/version.js'

replace_all(log_view, 'label: `Episode ${index + 1}`,', 'label: `Window ${index + 1}`,')
replace_all(log_view, "label: 'No Incident'", "label: 'No Incident Window'")

p = Path(log_view)
text = p.read_text()
if 'function evidenceGapSummary(' not in text:
    anchor = '\nexport function hostRole'
    if anchor not in text:
        raise SystemExit('hostRole anchor not found')
    helpers = r'''

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
'''
    text = text.replace(anchor, helpers + anchor, 1)
    p.write_text(text)

must_replace(
    log_view,
    "  const { episodes: incidentEpisodes, cadence } = buildIncidentEpisodes(evidenceSnapshots)\n",
    "  const { episodes: incidentEpisodes, cadence } = buildIncidentEpisodes(evidenceSnapshots)\n  const evidenceGaps = evidenceGapSummary(evidenceSnapshots, analysis.telemetry || [], host, cadence.gapThresholdMinutes)\n",
)
must_replace(
    log_view,
    "  const landscape = landscapeTelemetry(analysis, displayTimes)\n",
    "  const landscape = landscapeTelemetry(analysis, displayTimes)\n  const landscapeConcurrent = maxConcurrentImpact(landscape)\n",
)
must_replace(
    log_view,
    "    incidentEpisodes, incidentFocus, incidentCadence: cadence, incidentEpisodeCounts: episodeCounts,\n",
    "    incidentEpisodes, incidentFocus, incidentCadence: cadence, incidentEpisodeCounts: episodeCounts, evidenceGaps, landscapeConcurrent,\n",
)

must_replace(
    tool,
    "  const landscapeOverview = view?.hostOverview || []\n  const landscapeCritCount = landscapeOverview.filter((row) => row.severity === 'CRIT').length\n  const landscapeWarnCount = landscapeOverview.filter((row) => row.severity === 'WARN').length\n  const landscapeSeverity = landscapeCritCount ? 'CRIT' : landscapeWarnCount ? 'WARN' : 'NORMAL'\n",
    "  const landscapeOverview = view?.hostOverview || []\n  const landscapeConcurrent = view?.landscapeConcurrent || { timeLabel: '—', crit: 0, warn: 0, normal: 0, sampled: 0, severity: 'NORMAL' }\n  const landscapeCritCount = Number(landscapeConcurrent.crit || 0)\n  const landscapeWarnCount = Number(landscapeConcurrent.warn || 0)\n  const landscapeSeverity = landscapeConcurrent.severity || (landscapeCritCount ? 'CRIT' : landscapeWarnCount ? 'WARN' : 'NORMAL')\n",
)
must_replace(
    tool,
    "  const completenessText = completeness.isRegular ? `${completeness.intervalMinutes}-min interval` : completeness.observedIntervals?.length ? `Irregular: ${completeness.observedIntervals.join(', ')} min` : 'Interval metadata unavailable'\n",
    "  const cadenceMinutes = view?.incidentCadence?.nominalMinutes || completeness.intervalMinutes || 0\n  const completenessText = cadenceMinutes ? `${cadenceMinutes}-min cadence` : 'Cadence unavailable'\n  const evidenceGaps = view?.evidenceGaps || { count: 0, collectionCount: 0, hostSpecificCount: 0, gaps: [] }\n  const gapParts = [evidenceGaps.collectionCount ? `${evidenceGaps.collectionCount} collection gap${evidenceGaps.collectionCount === 1 ? '' : 's'}` : '', evidenceGaps.hostSpecificCount ? `${evidenceGaps.hostSpecificCount} host-specific gap${evidenceGaps.hostSpecificCount === 1 ? '' : 's'}` : ''].filter(Boolean)\n  const gapText = gapParts.length ? gapParts.join(' · ') : 'No large evidence gaps'\n",
)

replacements = {
    '<span>Host Incident</span>': '<span>Incident Window</span>',
    '<option value="latest">Latest Host Incident</option>': '<option value="latest">Latest Incident Window</option>',
    '<option value="peak">Peak Host Incident</option>': '<option value="peak">Peak Pressure Window</option>',
    'Host Incident Episodes': 'Detected Incident Windows',
    'Selected Host Incident': 'Selected Incident Window',
    'Latest Host Incident': 'Latest Incident Window',
    'Peak Host Incident': 'Peak Pressure Window',
    'Incident Episodes': 'Incident Windows',
    'incident episodes': 'incident windows',
    'incident episode': 'incident window',
    'host incident episodes': 'incident windows',
    'host episodes': 'incident windows',
    'All Host Incident Episode Errors': 'All Incident Window Errors',
    'Selected Host Incident Errors': 'Selected Incident Window Errors',
    'Selected Host Incident Snapshots': 'Selected Incident Window Snapshots',
    'Selected-host incident timing': 'Selected-host incident window timing',
    'Host Incident Scope': 'Incident Window Scope',
}
p = Path(tool)
text = p.read_text()
for old, new in replacements.items():
    text = text.replace(old, new)
text = text.replace(
    "<small>{episodes.length} incident window{episodes.length === 1 ? '' : 's'} · gap threshold {view?.incidentCadence?.gapThresholdMinutes || 30} min</small>",
    "<small>{gapText} · line breaks mean missing evidence, not downtime proof</small>",
)
text = text.replace(
    "meta={`${evidenceWindow.count || 0} snapshots · full uploaded scope`}",
    "meta={`${evidenceWindow.count || 0} snapshots · ${evidenceGaps.count ? `${evidenceGaps.count} evidence gaps` : 'continuous evidence'}`}",
)
old_metric = "<Metric label=\"Landscape Impact\" value={landscapeSeverity} meta={`${landscapeCritCount} CRIT · ${landscapeWarnCount} WARN · ${landscapeOverview.length} sampled hosts`} tone={landscapeSeverity === 'CRIT' ? 'critical' : landscapeSeverity === 'WARN' ? 'warn' : 'good'} />"
new_metric = "<Metric label=\"Landscape Concurrency\" value={landscapeSeverity} meta={`${landscapeCritCount} CRIT · ${landscapeWarnCount} WARN · ${landscapeConcurrent.sampled || 0} sampled at ${compactTime(landscapeConcurrent.timeLabel || '—')}`} tone={landscapeSeverity === 'CRIT' ? 'critical' : landscapeSeverity === 'WARN' ? 'warn' : 'good'} />"
if old_metric not in text:
    raise SystemExit('Landscape Impact metric source not found')
text = text.replace(old_metric, new_metric, 1)
text = text.replace(
    "All evidence is shown; large collection gaps are intentionally disconnected.",
    "All evidence is shown. Line breaks mark evidence gaps and are not downtime proof.",
)
text = text.replace('<h2>Incident Signal Peaks</h2>', "<h2>{incident.isAggregate ? 'Evidence Resource Peaks' : 'Incident Resource Peaks'}</h2>")
text = text.replace('<h2>Incident Resource Peaks</h2>', "<h2>{incident.isAggregate ? 'Evidence Resource Peaks' : 'Incident Resource Peaks'}</h2>")
text = text.replace('Threshold signals across the evidence window.', 'Resource peaks across the evidence window.')
text = text.replace('Threshold signals inside the selected host incident scope.', 'Resource peaks inside the selected incident window.')
text = text.replace('<span>Landscape Impact</span><b>{landscapeSeverity}</b>', '<span>Landscape Concurrency</span><b>{landscapeSeverity}</b>')
p.write_text(text)

p = Path(landscape)
text = p.read_text()
start = text.index('  const impact = React.useMemo(() => {')
end = text.index('\n\n  return <section', start)
new_impact = r'''  const impact = React.useMemo(() => {
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
  }, [view?.landscapeConcurrent, view?.landscapeTelemetry, view?.severity])'''
text = text[:start] + new_impact + text[end:]
text = text.replace('Selected-host incident timing overlaid across application servers. Large evidence gaps are not connected.', 'Selected incident-window timing across application servers. Line breaks are evidence gaps, not downtime proof.')
text = text.replace('<span>Landscape Impact</span><b>{impact.severity}</b><small>Worst status in host incident window · {impact.critHosts.length} CRIT · {impact.warnHosts.length} WARN · {impact.sampledHosts} sampled</small>', '<span>Landscape Concurrency</span><b>{impact.severity}</b><small>Maximum simultaneous status at {compactLabel(impact.timeLabel)} · {impact.critHosts.length} CRIT · {impact.warnHosts.length} WARN · {impact.sampledHosts} sampled</small>')
p.write_text(text)

replace_all(lifecycle, 'Selected host incident episode.', 'Selected incident window.')

p = Path(version)
text = p.read_text()
text = text.replace("export const APP_VERSION = '1.5.9'", "export const APP_VERSION = '1.6.0'")
text = text.replace("export const LOG_UI_REVISION = 'materiality-recovery-v1'", "export const LOG_UI_REVISION = 'incident-windows-evidence-gaps-v1'")
p.write_text(text)
