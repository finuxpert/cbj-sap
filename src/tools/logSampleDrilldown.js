const numberValue = (value, fallback = -1) => {
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
