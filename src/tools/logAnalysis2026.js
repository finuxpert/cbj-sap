const UNKNOWN = '?'

function num(value, fallback = 0) {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : fallback
}

function metric(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function maxMetric(a, b) {
  const left = metric(a); const right = metric(b)
  if (left === null) return right
  if (right === null) return left
  return Math.max(left, right)
}

function text(value) {
  return String(value ?? '').trim()
}

function cleanSapField(value = '') {
  let out = text(value)
  if (!out || out === UNKNOWN) return UNKNOWN
  out = out.replace(/=+$/g, '').trim()
  if (!out || /^[-_=*]+$/.test(out)) return UNKNOWN
  return out
}

function isUsefulJobName(jobName = '', program = '') {
  const job = cleanSapField(jobName)
  const prog = cleanSapField(program)
  if (job === UNKNOWN) return false
  if (job === prog) return false
  if (/^PID\s+\d+$/i.test(job)) return false
  return true
}

export function hhmm(value = '') {
  const match = String(value || '').match(/\b(\d{1,2}:\d{2})(?::\d{2})?\b/)
  return match ? match[1].padStart(5, '0') : ''
}

function snapshotSortKey(value = '') {
  const input = String(value || '')
  const match = input.match(/(\d{4})-(\d{2})-(\d{2}).*?(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (!match) {
    const time = hhmm(input)
    return time ? Number(time.replace(':', '')) : Number.MAX_SAFE_INTEGER
  }
  return Number(`${match[1]}${match[2]}${match[3]}${String(match[4]).padStart(2, '0')}${match[5]}${match[6] || '00'}`)
}

function severityRank(value = '') {
  return ({ OK: 0, NORMAL: 0, WARN: 1, CRIT: 2 })[String(value || '').toUpperCase()] ?? 0
}

function worseSeverity(a = 'OK', b = 'OK') {
  return severityRank(b) > severityRank(a) ? b : a
}

function processIdentity(row = {}) {
  return [row.snapshot, row.host, row.instance, row.pid, row.wp].join('|')
}

function workloadName(row = {}) {
  const job = cleanSapField(row.jobName)
  const program = cleanSapField(row.program)
  if (isUsefulJobName(job, program)) return job
  if (program !== UNKNOWN) return program
  return row.pid ? `PID ${row.pid}` : 'Unknown process'
}

function parseTrailingFields(rest = '') {
  const pathMatch = text(rest).match(/\s+(\/\S+)\s*$/)
  const logPath = pathMatch?.[1] || ''
  const noPath = pathMatch ? text(rest).slice(0, pathMatch.index).trim() : text(rest)
  const parts = noPath.split(/\s+/).filter(Boolean)
  const rawJob = parts.pop() || UNKNOWN
  const rawError = parts.pop() || UNKNOWN
  const rawProgram = parts.join(' ') || UNKNOWN
  const program = cleanSapField(rawProgram)
  const errorCode = cleanSapField(rawError)
  let jobName = cleanSapField(rawJob)
  if (jobName === program) jobName = UNKNOWN
  return { program, errorCode, jobName, logPath }
}

function parseProcessRow(line, context = {}, section = '') {
  const rx = /^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+([\d.]+)\s+(\S+)\s+([\d.]+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(CRIT|WARN|OK)\s+(\S+)\s+(\S+)\s+(.*)$/
  const match = text(line).match(rx)
  if (!match) return null
  const trailing = parseTrailingFields(match[17])
  return {
    fileName: context.fileName || '', snapshot: context.snapshot || '', sortKey: snapshotSortKey(context.snapshot), timeLabel: hhmm(context.snapshot) || hhmm(context.fileName),
    host: context.host || 'UNKNOWN', sid: match[15] || context.sid || '', instance: match[2] || context.instance || '', pid: match[1], wp: match[3], type: cleanSapField(match[4]),
    cpu: num(match[5]), memRaw: match[6], rssGb: num(match[7]), state: cleanSapField(match[8]), age: cleanSapField(match[9]), rabax: num(match[10]), sxpg: num(match[11]), jobCounter: num(match[12]), rxmsg: num(match[13]),
    className: match[14], ...trailing, section, source: 'WP-SCOUT', resourceSample: true,
  }
}

function parseRabaxRow(line, context = {}, section = '') {
  if (section !== 'RABAX') return null
  const rx = /^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(CRIT|WARN|OK)\s+(.*)$/
  const match = text(line).match(rx)
  if (!match) return null
  const trailing = parseTrailingFields(match[10])
  return {
    fileName: context.fileName || '', snapshot: context.snapshot || '', sortKey: snapshotSortKey(context.snapshot), timeLabel: hhmm(context.snapshot) || hhmm(context.fileName),
    host: context.host || 'UNKNOWN', sid: context.sid || '', instance: match[2] || context.instance || '', pid: match[1], wp: match[3], type: cleanSapField(match[4]),
    cpu: null, memRaw: '', rssGb: null, state: UNKNOWN, age: UNKNOWN, rabax: num(match[5]), sxpg: num(match[6]), rxmsg: num(match[7]), jobCounter: num(match[8]),
    className: match[9], ...trailing, section, source: 'WP-SCOUT', resourceSample: false,
  }
}

function mergeProcessRows(rows = []) {
  const map = new Map()
  rows.forEach((row) => {
    const key = processIdentity(row)
    const current = map.get(key)
    if (!current) {
      map.set(key, { ...row, sections: new Set(row.section ? [row.section] : []) })
      return
    }
    current.cpu = maxMetric(current.cpu, row.cpu)
    current.rssGb = maxMetric(current.rssGb, row.rssGb)
    current.resourceSample = Boolean(current.resourceSample || row.resourceSample)
    current.rabax = Math.max(num(current.rabax), num(row.rabax))
    current.sxpg = Math.max(num(current.sxpg), num(row.sxpg))
    current.jobCounter = Math.max(num(current.jobCounter), num(row.jobCounter))
    current.rxmsg = Math.max(num(current.rxmsg), num(row.rxmsg))
    current.className = worseSeverity(current.className, row.className)
    ;['program', 'jobName', 'errorCode', 'type', 'state', 'age'].forEach((field) => {
      if ((!current[field] || current[field] === UNKNOWN) && row[field] && row[field] !== UNKNOWN) current[field] = row[field]
    })
    if (row.section) current.sections.add(row.section)
  })
  return Array.from(map.values()).map((row) => ({ ...row, sections: Array.from(row.sections), workloadName: workloadName(row) }))
}

function newTelemetry(context = {}) {
  return {
    fileName: context.fileName || '', snapshot: context.snapshot || '', sortKey: snapshotSortKey(context.snapshot), timeLabel: hhmm(context.snapshot) || hhmm(context.fileName),
    host: context.host || 'UNKNOWN', sid: context.sid || '', instance: context.instance || '', os: '', uptime: '', ip: '', vcpu: 0, cpuPct: 0,
    load1: 0, load5: 0, load15: 0, loadRatio: 0, memoryUsedGb: 0, memoryFreeGb: 0, memoryTotalGb: 0, memoryPct: 0, swapIn: 0, swapOut: 0,
    wpRunning: 0, wpStandby: 0, wpCritical: 0, wpOk: 0, wpDialog: 0, wpBtc: 0, wpUpd: 0,
  }
}

function telemetryHasData(row = {}) {
  return Boolean(row.snapshot && row.host && row.host !== 'UNKNOWN' && (row.vcpu || row.cpuPct || row.memoryTotalGb || row.load15 || row.swapIn || row.wpRunning || row.wpStandby || row.wpCritical || row.wpOk))
}

function parseTelemetryLine(line, current) {
  if (!current) return
  let match
  if ((match = line.match(/^OS\s*:\s*(.+)$/i))) current.os = match[1].trim()
  else if ((match = line.match(/^Uptime\s*:\s*(.+)$/i))) current.uptime = match[1].trim()
  else if ((match = line.match(/^vCPU\s*:\s*(\d+)/i))) current.vcpu = num(match[1])
  else if ((match = line.match(/^IP address\s*:\s*(.+)$/i))) current.ip = match[1].trim()
  else if ((match = line.match(/CPU\s+usage\s*:\s*([\d.,]+)\s*%/i))) current.cpuPct = num(match[1])
  else if ((match = line.match(/Load\s*\(15m\)\s*:\s*L15=([\d.,]+),\s*vCPU=(\d+),\s*r=([\d.,]+).*?LA\s+([\d.,]+)\/([\d.,]+)\/([\d.,]+)/i))) {
    current.vcpu = num(match[2], current.vcpu); current.loadRatio = num(match[3]); current.load1 = num(match[4]); current.load5 = num(match[5]); current.load15 = num(match[6], num(match[1]))
  } else if ((match = line.match(/Memory\s*:\s*used\s+([\d.,]+)G\s*\(([\d.,]+)%\),\s*free\s+([\d.,]+)G\s*\/\s*([\d.,]+)G/i))) {
    current.memoryUsedGb = num(match[1]); current.memoryPct = num(match[2]); current.memoryFreeGb = num(match[3]); current.memoryTotalGb = num(match[4])
  } else if ((match = line.match(/Swap\s+IO\s*:\s*si\/so\s+([\d.,]+)\/([\d.,]+)\s*p\/s/i))) { current.swapIn = num(match[1]); current.swapOut = num(match[2]) }
  else if ((match = line.match(/Total\s+WP\s+Running\s*:\s*(\d+)/i))) current.wpRunning = num(match[1])
  else if ((match = line.match(/Total\s+WP\s+Standby\s*:\s*(\d+)/i))) current.wpStandby = num(match[1])
  else if ((match = line.match(/Total\s+WP\s+Critical\s*:\s*(\d+)/i))) current.wpCritical = num(match[1])
  else if ((match = line.match(/Total\s+WP\s+OK\s*:\s*(\d+)/i))) current.wpOk = num(match[1])
  else if ((match = line.match(/Total\s+WP\s+Dialog\s*:\s*(\d+)/i))) current.wpDialog = num(match[1])
  else if ((match = line.match(/Total\s+WP\s+BTC\s*:\s*(\d+)/i))) current.wpBtc = num(match[1])
  else if ((match = line.match(/Total\s+WP\s+UPD\s*:\s*(\d+)/i))) current.wpUpd = num(match[1])
}

export function parseLogText(rawText = '', fileName = '') {
  const lines = String(rawText || '').replace(/\r/g, '').split('\n')
  const telemetry = []; const processRows = []
  const context = { fileName, snapshot: '', host: 'UNKNOWN', sid: '', instance: '' }
  let currentTelemetry = null; let section = ''
  const flushTelemetry = () => { if (currentTelemetry && telemetryHasData(currentTelemetry)) telemetry.push({ ...currentTelemetry }); currentTelemetry = null }

  lines.forEach((rawLine) => {
    const line = text(rawLine); if (!line) return
    let match = line.match(/^snapshot\s*@\s*(.+)$/i)
    if (match) {
      flushTelemetry(); context.snapshot = match[1].trim(); context.host = 'UNKNOWN'; context.sid = ''; context.instance = ''; section = ''; currentTelemetry = newTelemetry(context); return
    }
    match = line.match(/^Hostname\s*:\s*(\S+)/i)
    if (match) { context.host = match[1].trim(); if (!currentTelemetry) currentTelemetry = newTelemetry(context); currentTelemetry.host = context.host; return }
    match = line.match(/^##\s*WP-SCOUT\s*@\s*(\S+)\s+SID=(\S+)\s+INSTS=(\S+)\s+TS=(.+)$/i)
    if (match) {
      context.host = match[1].trim(); context.sid = match[2].trim(); context.instance = match[3].trim(); if (!context.snapshot) context.snapshot = match[4].trim()
      if (!currentTelemetry) currentTelemetry = newTelemetry(context)
      Object.assign(currentTelemetry, { host: context.host, sid: context.sid, instance: context.instance, snapshot: context.snapshot, timeLabel: hhmm(context.snapshot), sortKey: snapshotSortKey(context.snapshot) }); return
    }
    if (/^CPU\s+Tertinggi/i.test(line)) { section = 'CPU'; return }
    if (/^Memory\s+Tertinggi/i.test(line)) { section = 'MEMORY'; return }
    if (/^Running\s+Terlama/i.test(line)) { section = 'AGE'; return }
    if (/^RABAX\s+Terbanyak/i.test(line)) { section = 'RABAX'; return }
    if (currentTelemetry) parseTelemetryLine(line, currentTelemetry)
    const process = parseProcessRow(line, context, section) || parseRabaxRow(line, context, section)
    if (process) processRows.push(process)
  })
  flushTelemetry()
  return { telemetry, processes: mergeProcessRows(processRows) }
}

function mergeTelemetry(rows = []) {
  const map = new Map()
  rows.forEach((row) => {
    const key = `${row.snapshot}|${row.host}`; const current = map.get(key)
    if (!current) { map.set(key, { ...row }); return }
    Object.keys(row).forEach((field) => { const value = row[field]; if (typeof value === 'number') current[field] = Math.max(num(current[field]), value); else if ((!current[field] || current[field] === 'UNKNOWN') && value) current[field] = value })
  })
  return Array.from(map.values()).sort((a, b) => a.sortKey - b.sortKey || a.host.localeCompare(b.host))
}

export function snapshotSeverity(snapshot = {}) {
  const cpu = num(snapshot.cpuPct), ram = num(snapshot.memoryPct), load = num(snapshot.loadRatio), swapIn = num(snapshot.swapIn), wpCritical = num(snapshot.wpCritical)
  if (load >= 1.5 || ram >= 85 || cpu >= 90 || swapIn >= 1000 || wpCritical >= 3) return 'CRIT'
  if (load >= 1 || ram >= 75 || cpu >= 75 || swapIn >= 100 || wpCritical >= 1) return 'WARN'
  return 'NORMAL'
}

function pressureScore(snapshot = {}) {
  const cpu = Math.min(1, num(snapshot.cpuPct) / 90), ram = Math.min(1, num(snapshot.memoryPct) / 85), load = Math.min(1, num(snapshot.loadRatio) / 1.5), swap = Math.min(1, num(snapshot.swapIn) / 1000)
  return Math.round(((cpu + ram + load + swap) / 4) * 100)
}

function peak(rows = [], key = '') {
  return rows.reduce((best, row) => num(row[key]) > num(best.value) ? { value: num(row[key]), time: row.timeLabel, row } : best, { value: 0, time: '', row: null })
}

function choosePrimaryHost(telemetry = []) {
  const map = new Map()
  telemetry.forEach((row) => {
    const current = map.get(row.host) || { host: row.host, maxPressure: 0, maxLoad: 0, maxRam: 0, maxCpu: 0, maxSwap: 0 }
    current.maxPressure = Math.max(current.maxPressure, pressureScore(row)); current.maxLoad = Math.max(current.maxLoad, num(row.loadRatio)); current.maxRam = Math.max(current.maxRam, num(row.memoryPct)); current.maxCpu = Math.max(current.maxCpu, num(row.cpuPct)); current.maxSwap = Math.max(current.maxSwap, num(row.swapIn)); map.set(row.host, current)
  })
  return Array.from(map.values()).sort((a, b) => b.maxPressure - a.maxPressure || b.maxLoad - a.maxLoad || b.maxRam - a.maxRam || b.maxCpu - a.maxCpu)[0]?.host || telemetry[0]?.host || 'UNKNOWN'
}

function recordTimeInWindow(row, timeSet, includeAll = false) {
  if (includeAll) return true
  if (!timeSet?.size) return false
  return timeSet.has(row.timeLabel)
}

export function buildJobGroups(processes = [], incidentTimes = new Set(), totalIncidentSnapshots = 0, includeAll = false) {
  const map = new Map()
  processes.filter((row) => recordTimeInWindow(row, incidentTimes, includeAll)).forEach((row) => {
    const name = workloadName(row); const key = `${row.host}|${name}`
    const current = map.get(key) || { key, name, host: row.host, programs: new Set(), pids: new Set(), wps: new Set(), types: new Set(), states: new Set(), times: new Set(), errors: new Set(), records: [], cpuTotal: 0, cpuCount: 0, peakCpu: null, peakRss: null, resourceSampleCount: 0 }
    if (row.program && row.program !== UNKNOWN) current.programs.add(row.program); if (row.pid) current.pids.add(row.pid); if (row.wp) current.wps.add(row.wp); if (row.type && row.type !== UNKNOWN) current.types.add(row.type); if (row.state && row.state !== UNKNOWN) current.states.add(row.state); if (row.timeLabel) current.times.add(row.timeLabel); if (row.errorCode && row.errorCode !== UNKNOWN) current.errors.add(row.errorCode)
    current.records.push(row)
    const cpuValue = metric(row.cpu); const rssValue = metric(row.rssGb)
    if (cpuValue !== null) { current.cpuTotal += cpuValue; current.cpuCount += 1; current.peakCpu = current.peakCpu === null ? cpuValue : Math.max(current.peakCpu, cpuValue) }
    if (rssValue !== null) current.peakRss = current.peakRss === null ? rssValue : Math.max(current.peakRss, rssValue)
    if (row.resourceSample || cpuValue !== null || rssValue !== null) current.resourceSampleCount += 1
    map.set(key, current)
  })
  return Array.from(map.values()).map((item) => {
    const records = item.records.sort((a, b) => a.sortKey - b.sortKey)
    const cpuRecords = records.filter((row) => metric(row.cpu) !== null)
    const rssRecords = records.filter((row) => metric(row.rssGb) !== null)
    const peakCpuRecord = cpuRecords.reduce((best, row) => metric(row.cpu) > metric(best?.cpu) ? row : best, null)
    const peakRssRecord = rssRecords.reduce((best, row) => metric(row.rssGb) > metric(best?.rssGb) ? row : best, null)
    const first = records[0], last = records[records.length - 1]
    const program = cleanSapField((peakRssRecord?.program && peakRssRecord.program !== UNKNOWN) ? peakRssRecord.program : (peakCpuRecord?.program || Array.from(item.programs)[0] || UNKNOWN))
    const identityType = isUsefulJobName(item.name, program) ? 'JOB' : item.name.startsWith('PID ') ? 'PID' : 'PROGRAM'
    return { ...item, programs: Array.from(item.programs), pids: Array.from(item.pids), wps: Array.from(item.wps), types: Array.from(item.types), states: Array.from(item.states), times: Array.from(item.times), errors: Array.from(item.errors), avgCpu: item.cpuCount ? item.cpuTotal / item.cpuCount : null, peakCpuRecord, peakRssRecord, firstSeen: first?.timeLabel || '—', lastSeen: last?.timeLabel || '—', persistenceCount: item.times.size, persistenceText: totalIncidentSnapshots ? `${item.times.size}/${totalIncidentSnapshots}` : `${item.times.size}`, topPid: peakRssRecord?.pid || peakCpuRecord?.pid || Array.from(item.pids)[0] || '', topWp: peakRssRecord?.wp || peakCpuRecord?.wp || Array.from(item.wps)[0] || '', topType: peakRssRecord?.type || peakCpuRecord?.type || Array.from(item.types)[0] || '', topState: peakRssRecord?.state || peakCpuRecord?.state || Array.from(item.states)[0] || UNKNOWN, program, identityType }
  })
}

function buildErrorSummary(processes = [], incidentTimes = new Set(), includeAll = false) {
  const map = new Map()
  processes.filter((row) => recordTimeInWindow(row, incidentTimes, includeAll) && row.errorCode && row.errorCode !== UNKNOWN).forEach((row) => {
    const current = map.get(row.errorCode) || { errorCode: row.errorCode, snapshots: new Set(), processes: new Set(), jobs: new Set(), records: [] }
    current.snapshots.add(`${row.host}|${row.timeLabel}`); current.processes.add(`${row.host}|${row.instance}|${row.pid}|${row.wp}`); current.jobs.add(workloadName(row)); current.records.push(row); map.set(row.errorCode, current)
  })
  return Array.from(map.values()).map((item) => { const records = item.records.sort((a, b) => a.sortKey - b.sortKey); return { errorCode: item.errorCode, snapshotRecords: item.snapshots.size, uniqueProcesses: item.processes.size, affectedJobs: item.jobs.size, firstSeen: records[0]?.timeLabel || '—', lastSeen: records[records.length - 1]?.timeLabel || '—' } }).sort((a, b) => b.uniqueProcesses - a.uniqueProcesses || b.snapshotRecords - a.snapshotRecords)
}

export function buildLogAnalysis(parsedFiles = []) {
  const telemetry = mergeTelemetry(parsedFiles.flatMap((item) => item.telemetry || [])); const processes = mergeProcessRows(parsedFiles.flatMap((item) => item.processes || [])); const primaryHost = choosePrimaryHost(telemetry)
  const primarySnapshots = telemetry.filter((row) => row.host === primaryHost).map((row) => ({ ...row, severity: snapshotSeverity(row), pressureScore: pressureScore(row) }))
  const analysisStart = primarySnapshots[0]?.timeLabel || '—', analysisEnd = primarySnapshots[primarySnapshots.length - 1]?.timeLabel || '—'
  let incidentSnapshots = primarySnapshots.filter((row) => row.severity === 'CRIT'); if (!incidentSnapshots.length) incidentSnapshots = primarySnapshots.filter((row) => row.severity === 'WARN')
  const incidentTimes = new Set(incidentSnapshots.map((row) => row.timeLabel)); const incidentStart = incidentSnapshots[0]?.timeLabel || '—', incidentEnd = incidentSnapshots[incidentSnapshots.length - 1]?.timeLabel || '—'
  const peakSnapshot = primarySnapshots.reduce((best, row) => row.pressureScore > (best?.pressureScore ?? -1) ? row : best, null)
  const peaks = { cpu: peak(primarySnapshots, 'cpuPct'), ram: peak(primarySnapshots, 'memoryPct'), load: peak(primarySnapshots, 'loadRatio'), swapIn: peak(primarySnapshots, 'swapIn'), swapOut: peak(primarySnapshots, 'swapOut'), wpCritical: peak(primarySnapshots, 'wpCritical') }
  const primaryProcesses = processes.filter((row) => row.host === primaryHost)
  const maxSeverity = primarySnapshots.reduce((best, row) => severityRank(row.severity) > severityRank(best) ? row.severity : best, 'NORMAL')
  return {
    telemetry, processes, primaryHost, primarySnapshots,
    analysisWindow: { start: analysisStart, end: analysisEnd, count: primarySnapshots.length }, incidentWindow: { start: incidentStart, end: incidentEnd, count: incidentSnapshots.length, times: Array.from(incidentTimes), severity: incidentSnapshots.length ? maxSeverity : 'NORMAL' }, incidentSnapshots,
    peakSnapshot, peakTime: peakSnapshot?.timeLabel || peaks.cpu.time || analysisEnd, peaks, severity: maxSeverity,
    hostComparison: telemetry.filter((row) => peakSnapshot?.fileName ? row.fileName === peakSnapshot.fileName : row.timeLabel === (peakSnapshot?.timeLabel || '')).map((row) => ({ ...row, severity: snapshotSeverity(row), pressureScore: pressureScore(row) })).sort((a, b) => b.pressureScore - a.pressureScore),
    jobs: buildJobGroups(primaryProcesses, incidentTimes, incidentSnapshots.length, false), jobsAll: buildJobGroups(primaryProcesses, new Set(), primarySnapshots.length, true),
    errors: buildErrorSummary(primaryProcesses, incidentTimes, false), errorsAll: buildErrorSummary(primaryProcesses, new Set(), true),
  }
}

export function sortJobs(jobs = [], metric = 'rss') {
  const copy = [...jobs]
  if (metric === 'cpu') return copy.sort((a, b) => num(b.peakCpu) - num(a.peakCpu) || num(b.avgCpu) - num(a.avgCpu))
  if (metric === 'persistence') return copy.sort((a, b) => b.persistenceCount - a.persistenceCount || num(b.peakRss) - num(a.peakRss))
  if (metric === 'errors') return copy.sort((a, b) => b.errors.length - a.errors.length || b.persistenceCount - a.persistenceCount)
  return copy.sort((a, b) => num(b.peakRss) - num(a.peakRss) || num(b.peakCpu) - num(a.peakCpu))
}
