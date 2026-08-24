import React from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts'
import CaseLinkPanel from '../features/cases/CaseLinkPanel.jsx'
import useCaseHistoryLink from '../features/cases/useCaseHistoryLink.js'
import { expandZipAwareFiles, fileExt, loadJson, safe, saveJson } from './evidence-utils.js'
import { parseGenericErrors } from './log-evidence-parser.js'
import { buildAnalysis } from './logtriage/analysis/buildAnalysis.js'
import './RcaWorkspace2026.css'

const CACHE_KEY = 'sap_rca_log_v1_cache'
const CASE_KEY = 'sap_rca_log_v1_case'

function hhmm(value = '') {
  const match = String(value || '').match(/\b(\d{1,2}:\d{2})(?::\d{2})?\b/)
  return match ? match[1].padStart(5, '0') : ''
}

function parsePercent(text, patterns = []) {
  for (const pattern of patterns) {
    const match = String(text || '').match(pattern)
    if (match) return Math.max(0, Math.min(100, Number(String(match[1]).replace(',', '.')) || 0))
  }
  return 0
}

function parseWpRows(text = '', fileName = '') {
  const snapshot = text.match(/snapshot\s*@\s*([^\n]+)/i)?.[1]?.trim() || ''
  const timeLabel = hhmm(snapshot) || hhmm(fileName)
  const host = text.match(/Hostname\s*:\s*(\S+)/i)?.[1]?.trim() || text.match(/##\s*WP-SCOUT\s*@\s*(\S+)/i)?.[1]?.trim() || 'UNKNOWN'
  const rows = []
  const rx = /^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+([\d.]+)\s+([\d.]+G)\s+([\d.]+)\s+([RSW])\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(CRIT|WARN|OK)\s+(\S+)\s+(\S+)\s+(.*)$/
  String(text || '').replace(/\r/g, '').split('\n').forEach((line) => {
    const m = safe(line).match(rx)
    if (!m) return
    const rest = safe(m[17])
    const pathIdx = rest.lastIndexOf(' /')
    const noPath = pathIdx >= 0 ? rest.slice(0, pathIdx).trim() : rest
    const parts = noPath.split(/\s+/).filter(Boolean)
    const jobName = parts.pop() || '?'
    const errorCode = parts.pop() || '?'
    const program = parts.join(' ') || '?'
    rows.push({ fileName, snapshot, timeLabel, host, pid: m[1], wp: m[3], type: m[4], cpu: Number(m[5]) || 0, rssGb: Number(m[7]) || 0, state: m[8], className: m[14], program, errorCode, jobName, lineNo: 0, source: 'WP-SCOUT' })
  })
  return rows
}

function parseOperationalTelemetry(text = '', fileName = '') {
  const rows = []
  let snapshot = ''
  let host = 'UNKNOWN'
  String(text || '').replace(/\r/g, '').split('\n').forEach((raw, index) => {
    const line = safe(raw)
    const snap = line.match(/^snapshot\s*@\s*(.+)$/i)
    if (snap) { snapshot = snap[1].trim(); return }
    const hostMatch = line.match(/^Hostname\s*:\s*(\S+)/i) || line.match(/^##\s*WP-SCOUT\s*@\s*(\S+)/i)
    if (hostMatch) { host = hostMatch[1].trim(); return }

    const cpu = parsePercent(line, [/CPU\s+usage\s*:\s*(\d+(?:[.,]\d+)?)\s*%/i, /cpu(?:_usage|\s*used)?\s*[:=]\s*(\d+(?:[.,]\d+)?)\s*%/i])
    const mem = parsePercent(line, [/Memory\s*:\s*.*?\(\s*(\d+(?:[.,]\d+)?)\s*%\s*\)/i, /mem(?:ory)?(?:_usage|\s*used)?\s*[:=]\s*(\d+(?:[.,]\d+)?)\s*%/i])
    const swap = parsePercent(line, [/Swap\s*:\s*.*?\(\s*(\d+(?:[.,]\d+)?)\s*%\s*\)/i, /swap(?:_usage|\s*used)?\s*[:=]\s*(\d+(?:[.,]\d+)?)\s*%/i])
    const swapIo = line.match(/si\/so\s+(\d+(?:[.,]\d+)?)\/(\d+(?:[.,]\d+)?)/i)
    if (!cpu && !mem && !swap && !swapIo) return
    rows.push({ fileName, timeLabel: hhmm(snapshot) || hhmm(line) || hhmm(fileName) || `S${index + 1}`, host, pid: '', wp: '', type: 'OS', cpu, mem, memoryPct: mem, swap, swapPct: swap, swapIn: Number(swapIo?.[1] || 0), swapOut: Number(swapIo?.[2] || 0), rssGb: 0, state: '', className: (cpu >= 95 || mem >= 95 || swap >= 95) ? 'CRIT' : (cpu >= 85 || mem >= 85 || swap >= 80) ? 'WARN' : 'OK', program: 'OS telemetry', errorCode: 'INFRA_RESOURCE_SIGNAL', jobName: '?', lineNo: index + 1, source: 'operational-telemetry' })
  })
  return rows
}

function buildCasePayload(analysis, title) {
  const top = analysis?.primary || {}
  return { title, severity: analysis?.infra_saturation?.severity || (top.critHits ? 'CRIT' : 'WARN'), summary: analysis?.summary || '', top_anomaly: top.name || analysis?.infra_saturation?.dominant || '', top_suspect: analysis?.topConsumer?.name || top.owner || '', status: 'OPEN', created_by: 'sap-rca-workspace-v1' }
}

function buildParsedPayload(analysis) {
  return {
    tool: 'LOG Analysis v1', verdict: analysis?.verdict || 'Log parsed', severity: analysis?.infra_saturation?.severity || 'INFO', confidence: Number(analysis?.confidence || 0), top_anomaly: analysis?.primary?.name || analysis?.infra_saturation?.dominant || '', top_suspect: analysis?.topConsumer?.name || analysis?.ownership_direction?.primary_owner || '', summary: analysis?.summary || '',
    result_json: { primary: analysis?.primary || null, infra_saturation: analysis?.infra_saturation || null, ownership_direction: analysis?.ownership_direction || null, system_resources: analysis?.system_resources || [], top_consumers: analysis?.consumers || [], rows: (analysis?.rows || []).slice(0, 150) },
  }
}

function timeToMinutes(value = '') {
  const match = String(value).match(/(\d{1,2}):(\d{2})/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

function minutesToLabel(value) {
  if (!Number.isFinite(value)) return '—'
  const h = Math.floor(value / 60) % 24
  const m = value % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function buildConsumers(rows = []) {
  const map = new Map()
  rows.filter((row) => row.source === 'WP-SCOUT' || row.jobName !== '?' || row.program !== 'OS telemetry').forEach((row) => {
    const name = row.jobName && row.jobName !== '?' ? row.jobName : row.program && row.program !== '?' ? row.program : `PID ${row.pid || 'unknown'}`
    const key = `${name}|${row.host || ''}`
    const item = map.get(key) || { name, host: row.host || 'UNKNOWN', hits: 0, cpuTotal: 0, cpuCount: 0, peakCpu: 0, peakRss: 0, times: new Set(), pid: row.pid || '', wp: row.wp || '', program: row.program || '' }
    item.hits += 1
    if (Number(row.cpu || 0) > 0) { item.cpuTotal += Number(row.cpu || 0); item.cpuCount += 1 }
    item.peakCpu = Math.max(item.peakCpu, Number(row.cpu || 0))
    item.peakRss = Math.max(item.peakRss, Number(row.rssGb || 0))
    if (row.timeLabel) item.times.add(row.timeLabel)
    if (!item.pid && row.pid) item.pid = row.pid
    if (!item.wp && row.wp) item.wp = row.wp
    map.set(key, item)
  })
  return Array.from(map.values()).map((item) => {
    const timeValues = Array.from(item.times).map(timeToMinutes).filter(Number.isFinite).sort((a, b) => a - b)
    const first = timeValues[0]
    const last = timeValues[timeValues.length - 1]
    return { ...item, times: Array.from(item.times), avgCpu: item.cpuCount ? item.cpuTotal / item.cpuCount : 0, durationMin: Number.isFinite(first) && Number.isFinite(last) ? Math.max(10, last - first + 10) : item.times.size * 10, firstTime: minutesToLabel(first), lastTime: minutesToLabel(last) }
  }).sort((a, b) => b.peakCpu - a.peakCpu || b.peakRss - a.peakRss || b.hits - a.hits)
}

function peakResource(resources = []) {
  const max = (key) => resources.reduce((best, row) => Number(row[key] || 0) > Number(best?.value || 0) ? { value: Number(row[key] || 0), time: row.name } : best, { value: 0, time: '' })
  return { cpu: max('cpuMax'), mem: max('memMax'), swap: max('swapMax') }
}

export default function ToolLogAnalysis2026({ processMode = false }) {
  const [files, setFiles] = React.useState([])
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('Upload OS/SAP log snapshots to begin incident analysis.')
  const [analysis, setAnalysis] = React.useState(() => loadJson(CACHE_KEY, null))
  const caseLink = useCaseHistoryLink({ storageKey: CASE_KEY, buildCasePayload, buildParsedPayload, defaultCaseTitle: 'LOG RCA Case', toolName: 'LOG Analysis v1', uploadTags: ['log', 'wp-scout', 'rca-v1'], requireExplicitSaveIntent: true, loadJson, saveJson })

  const analyzeFiles = React.useCallback(async (nextFiles) => {
    setBusy(true)
    setStatus('Analyzing log, process, and OS telemetry…')
    try {
      const rows = []
      for (const file of nextFiles) {
        const text = await file.text()
        rows.push(...parseWpRows(text, file.name), ...parseOperationalTelemetry(text, file.name), ...parseGenericErrors(text, file.name))
      }
      const result = buildAnalysis(nextFiles.map((file) => ({ name: file.name, size: file.size })), rows, null)
      const consumers = buildConsumers(rows)
      result.consumers = consumers
      result.topConsumer = consumers[0] || null
      setAnalysis(result)
      saveJson(CACHE_KEY, result)
      setStatus('Analysis complete.')
    } catch (error) {
      setStatus(error?.message || 'Failed to analyze log evidence.')
    } finally {
      setBusy(false)
    }
  }, [])

  const onFiles = React.useCallback(async (fileList) => {
    setBusy(true)
    try {
      const expanded = (await expandZipAwareFiles(fileList, ['log', 'txt', 'csv'])).filter((file) => ['log', 'txt', 'csv'].includes(fileExt(file.name)))
      setFiles(expanded)
      await analyzeFiles(expanded)
    } catch (error) {
      setStatus(error?.message || 'Failed to read upload.')
      setBusy(false)
    }
  }, [analyzeFiles])

  const resources = analysis?.system_resources || []
  const peaks = React.useMemo(() => peakResource(resources), [resources])
  const consumers = analysis?.consumers || []
  const topConsumer = consumers[0] || null
  const incidentRows = resources.filter((row) => Math.max(Number(row.cpuMax || row.cpu || 0), Number(row.memMax || row.mem || 0), Number(row.swapMax || row.swap || 0)) >= 85)
  const incidentStart = incidentRows[0]?.name || resources[0]?.name || '—'
  const incidentEnd = incidentRows[incidentRows.length - 1]?.name || resources[resources.length - 1]?.name || '—'
  const peakMetric = [{ name: 'CPU', ...peaks.cpu }, { name: 'RAM', ...peaks.mem }, { name: 'SWAP', ...peaks.swap }].sort((a, b) => b.value - a.value)[0]
  const severity = analysis?.infra_saturation?.severity || (analysis?.primary?.critHits ? 'CRIT' : analysis ? 'WARN' : 'WAITING')
  const confidence = Number(analysis?.confidence || 0)
  const primaryName = topConsumer?.name || analysis?.primary?.name || 'No suspect yet'

  return (
    <section className="rca26Shell">
      <div className="rca26Inner">
        <header className="rca26Head">
          <div><h1>{processMode ? 'LOG Process Analysis' : 'LOG Incident Analysis'}</h1><p>10-minute resource snapshots, SAP jobs/processes, error evidence, and incident correlation.</p></div>
          <label className="rca26Upload"><input type="file" multiple accept=".zip,.log,.txt,.csv" onChange={(event) => onFiles(event.target.files)} />{busy ? 'Analyzing…' : 'Upload Evidence'}</label>
        </header>

        <nav className="rca26Tabs"><a href="#/log" data-active={processMode ? 'false' : 'true'}>Incident</a><a href="#/tool/logs/process" data-active={processMode ? 'true' : 'false'}>Processes & Jobs</a></nav>

        <section className="rca26Kpis">
          <article className={`rca26Kpi ${severity === 'CRIT' ? 'critical' : severity === 'INFO' ? 'good' : 'info'}`}><span>Incident status</span><strong>{severity}</strong><small>{analysis?.infra_saturation?.verdict || status}</small></article>
          <article className="rca26Kpi good"><span>Confidence</span><strong>{confidence}%</strong><small>{analysis?.confidenceText || 'Pending evidence'}</small></article>
          <article className="rca26Kpi info"><span>Primary suspect</span><strong title={primaryName}>{primaryName}</strong><small>{topConsumer ? `${topConsumer.host} · PID ${topConsumer.pid || 'n/a'}` : analysis?.ownership_direction?.primary_owner || 'Unknown owner'}</small></article>
          <article className="rca26Kpi info"><span>Incident window</span><strong>{incidentStart} – {incidentEnd}</strong><small>{incidentRows.length ? `${incidentRows.length} high-pressure snapshot(s)` : 'No high-pressure window'}</small></article>
          <article className={`rca26Kpi ${peakMetric?.value >= 95 ? 'critical' : 'info'}`}><span>Peak resource</span><strong>{peakMetric?.name || '—'} {Number(peakMetric?.value || 0).toFixed(0)}%</strong><small>{peakMetric?.time ? `at ${peakMetric.time}` : 'No telemetry'}</small></article>
        </section>

        <div className="rca26Grid">
          <section className="rca26Panel">
            <div className="rca26PanelHead"><div><h2>Resource Utilization Timeline</h2><p>CPU, RAM, and SWAP by snapshot. Use peaks and persistence to define the incident window.</p></div></div>
            {resources.length ? (
              <>
                <div className="rca26Chart tall"><ResponsiveContainer width="100%" height="100%"><LineChart data={resources} margin={{ top: 12, right: 20, left: 0, bottom: 10 }}><CartesianGrid strokeDasharray="3 6" vertical={false}/><XAxis dataKey="name"/><YAxis domain={[0,100]}/><Tooltip formatter={(value) => `${Number(value || 0).toFixed(0)}%`}/><Legend/><Line type="monotone" dataKey="cpuMax" name="CPU %" stroke="#26d3d1" strokeWidth={2.4} dot={{r:3}}/><Line type="monotone" dataKey="memMax" name="RAM %" stroke="#42a5ff" strokeWidth={2.2} dot={{r:3}}/><Line type="monotone" dataKey="swapMax" name="SWAP %" stroke="#9d79ff" strokeWidth={2.2} dot={{r:3}}/></LineChart></ResponsiveContainer></div>
                <div className="rca26MiniRow"><div className="rca26Mini"><span>Peak CPU</span><strong>{peaks.cpu.value.toFixed(0)}%</strong></div><div className="rca26Mini"><span>Peak RAM</span><strong>{peaks.mem.value.toFixed(0)}%</strong></div><div className="rca26Mini"><span>Peak SWAP</span><strong>{peaks.swap.value.toFixed(0)}%</strong></div><div className="rca26Mini"><span>High snapshots</span><strong>{incidentRows.length}</strong></div><div className="rca26Mini"><span>Top job/process</span><strong title={primaryName}>{String(primaryName).slice(0,18)}</strong></div></div>
              </>
            ) : <div className="rca26Empty">Upload logs containing CPU/RAM/SWAP snapshots to render the resource timeline.</div>}
          </section>

          <section className="rca26Panel">
            <div className="rca26PanelHead"><div><h2>RCA Insight</h2><p>Current deterministic evidence summary.</p></div></div>
            {analysis ? <div className="rca26Insight"><span className="rca26InsightBadge">Likely RCA candidate</span><h3><em>{primaryName}</em> correlates with {analysis?.infra_saturation?.dominant || 'SAP'} pressure.</h3><div className="rca26Reason"><div><b>✓</b><span>Peak CPU {peaks.cpu.value.toFixed(0)}%, RAM {peaks.mem.value.toFixed(0)}%, SWAP {peaks.swap.value.toFixed(0)}%.</span></div><div><b>✓</b><span>{topConsumer ? `${topConsumer.hits} observation(s), peak CPU ${topConsumer.peakCpu.toFixed(0)}%, peak RSS ${topConsumer.peakRss.toFixed(1)} GB.` : 'No dominant process telemetry yet.'}</span></div><div><b>✓</b><span>Primary error: {analysis.primary?.name || 'none'} · owner {analysis.ownership_direction?.primary_owner || 'unknown'}.</span></div></div><div className="rca26Note"><b>Next validation:</b> {analysis.nextAction || 'Validate the dominant process/job in SM50/SM66 and SM37, then correlate with ST03N.'}</div></div> : <div className="rca26Empty">No incident finding yet.</div>}
          </section>
        </div>

        <div className="rca26Grid three">
          <section className="rca26Panel"><div className="rca26PanelHead"><div><h2>Top Resource Consumers</h2><p>Ranked by peak CPU, RSS, and recurrence.</p></div></div><div className="rca26Bars">{consumers.slice(0,6).map((item) => <div className="rca26BarRow" key={`${item.name}-${item.host}`}><label title={item.name}>{item.name}</label><div className="rca26BarTrack"><div className="rca26BarFill" style={{width:`${Math.max(2,Math.min(100,item.peakCpu || item.avgCpu || 0))}%`}}/></div><strong>{item.peakCpu.toFixed(0)}%</strong></div>)}{!consumers.length ? <div className="rca26Empty">No job/process consumers yet.</div> : null}</div></section>
          <section className="rca26Panel"><div className="rca26PanelHead"><div><h2>Persistence Timeline</h2><p>Approximate duration from 10-minute snapshots.</p></div></div><div className="rca26Bars">{consumers.slice(0,6).map((item) => <div className="rca26BarRow" key={`p-${item.name}-${item.host}`}><label title={item.name}>{item.name}</label><div className="rca26BarTrack"><div className="rca26BarFill" style={{width:`${Math.max(4,Math.min(100,(item.durationMin/60)*100))}%`}}/></div><strong>{item.durationMin}m</strong></div>)}{!consumers.length ? <div className="rca26Empty">Need repeated snapshots to measure persistence.</div> : null}</div></section>
          <section className="rca26Panel"><div className="rca26PanelHead"><div><h2>Offenders</h2><p>Job/process evidence within the current window.</p></div></div><div className="rca26TableWrap"><table className="rca26Table"><thead><tr><th>Job / Process</th><th>Avg CPU</th><th>Peak CPU</th><th>Peak RSS</th><th>Hits</th></tr></thead><tbody>{consumers.slice(0,20).map((item) => <tr key={`t-${item.name}-${item.host}`}><td title={item.name}>{String(item.name).slice(0,28)}</td><td>{item.avgCpu.toFixed(1)}%</td><td>{item.peakCpu.toFixed(1)}%</td><td>{item.peakRss.toFixed(1)} GB</td><td>{item.hits}</td></tr>)}</tbody></table></div></section>
        </div>

        <section className="rca26Case"><div><span>Analysis case</span><strong>{caseLink.caseId || 'Not linked'}</strong><small>{files.length} evidence file(s) · explicit save only</small></div><div className="rca26CaseActions"><a className="rca26Link" href="#/cases">History</a><button className="rca26Btn primary" type="button" onClick={() => document.getElementById('log-case-v1')?.toggleAttribute('open')}>Manage case</button></div></section>
        <details className="rca26Disclosure" id="log-case-v1"><summary>Case & evidence persistence</summary><div className="rca26DisclosureBody"><CaseLinkPanel title="LOG case" description="Create or link a case after validating the incident window and top suspect." caseId={caseLink.caseId} caseTitle={caseLink.caseTitle} recentCases={caseLink.recentCases} savingCase={caseLink.savingCase} creatingCase={caseLink.creatingCase} saveStatus={caseLink.saveStatus} onCaseIdChange={caseLink.setCaseId} onCaseTitleChange={caseLink.setCaseTitle} onCreateCase={() => caseLink.createLinkedCase(analysis)} onSaveCurrent={(options) => caseLink.persistAnalysis(analysis, files, {}, options)} hasAnalysis={Boolean(analysis)} saveLabel="Save LOG analysis" titlePlaceholder="Contoh: AOP PRD CPU saturation 10:00-11:00" /></div></details>
      </div>
    </section>
  )
}
