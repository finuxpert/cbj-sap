const CPU_WARNING = 75
const CPU_CRITICAL = 90
const RAM_WARNING = 80
const RAM_CRITICAL = 90
const IOWAIT_WARNING = 10
const IOWAIT_CRITICAL = 20
const WP_CRITICAL = 3

const numeric = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function hostResourceState(host = {}) {
  const cpu = numeric(host.cpu_pct)
  const ram = numeric(host.ram_pct)
  const ioWait = numeric(host.io_wait_pct)
  if ((cpu !== null && cpu >= CPU_CRITICAL) || (ram !== null && ram >= RAM_CRITICAL) || (ioWait !== null && ioWait >= IOWAIT_CRITICAL)) return 'CRITICAL'
  if ((cpu !== null && cpu >= CPU_WARNING) || (ram !== null && ram >= RAM_WARNING) || (ioWait !== null && ioWait >= IOWAIT_WARNING)) return 'WARNING'
  return 'NORMAL'
}

export function sapWorkloadState(host = {}) {
  const wp = numeric(host.wp_critical) || 0
  if (wp >= WP_CRITICAL) return 'CRITICAL'
  if (wp > 0) return 'ATTENTION'
  return 'NORMAL'
}

export function overallOperationalState(hosts = [], options = {}) {
  const { stale = false, incidentActive = false } = options
  if (!hosts.length) return 'WAITING'

  const resourceStates = hosts.map(hostResourceState)
  const workloadStates = hosts.map(sapWorkloadState)
  if (resourceStates.includes('CRITICAL') || workloadStates.includes('CRITICAL')) return 'CRITICAL'
  if (resourceStates.includes('WARNING') || stale) return 'WARNING'
  if (workloadStates.includes('ATTENTION') || incidentActive) return 'ATTENTION'
  return 'NORMAL'
}

export function statusExplanation(status, hosts = []) {
  const resourceStates = hosts.map(hostResourceState)
  const workloadStates = hosts.map(sapWorkloadState)
  if (status === 'CRITICAL') {
    if (resourceStates.includes('CRITICAL')) return 'Critical host resource threshold detected.'
    return 'Critical SAP workload signal detected.'
  }
  if (status === 'WARNING') return 'Host resource warning threshold or monitoring freshness warning detected.'
  if (status === 'ATTENTION') return 'Host resources are within thresholds; SAP workload signal requires review.'
  if (status === 'NORMAL') return 'Host resources and SAP workload signals are within normal thresholds.'
  return 'Monitoring status is waiting for complete data.'
}
