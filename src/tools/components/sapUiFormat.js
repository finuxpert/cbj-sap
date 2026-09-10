export const shortHost = (host = '') => {
  const value = String(host || '').trim()
  const direct = value.match(/^APP(\d+)$/i)
  if (direct) return `APP${direct[1]}`
  const aop = value.match(/AOPH(\d+)PAPPDC/i)
  if (aop) return `APP${aop[1]}`
  const generic = value.match(/H(\d+)PAPP/i)
  return generic ? `APP${generic[1]}` : value
}

export const workloadTypeLabel = (value = '') => ({
  JOB: 'Job',
  PROGRAM: 'Program',
  PROCESS: 'Process',
})[String(value || '').toUpperCase()] || 'Workload'

export const formatWib = (value, withDate = false, withSeconds = false) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    ...(withDate ? { day: '2-digit', month: 'short' } : {}),
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
    hour12: false,
  }).format(date)
}

export const numberText = (value, digits = 1) => {
  if (value === null || value === undefined || value === '') return '—'
  const parsed = Number(value)
  return Number.isFinite(parsed)
    ? parsed.toLocaleString('en-US', { maximumFractionDigits: digits })
    : '—'
}
