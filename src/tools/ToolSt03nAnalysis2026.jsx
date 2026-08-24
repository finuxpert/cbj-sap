import React from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts'
import CaseLinkPanel from '../features/cases/CaseLinkPanel.jsx'
import useCaseHistoryLink from '../features/cases/useCaseHistoryLink.js'
import { fmt, loadJson, saveJson } from './evidence-utils.js'
import {
  buildSt03nAnalysis,
  classifySt03nFile,
  expandSt03nFiles,
  parseSt03nFile,
  REQUIRED_ST03N,
} from './parsers/st03nParser.js'
import './RcaWorkspace2026.css'

const CACHE_KEY = 'sap_rca_st03n_v1_cache'
const CASE_KEY = 'sap_rca_st03n_v1_case'

function buildCasePayload(analysis, title) {
  const top = analysis?.top || {}
  return {
    title,
    severity: analysis?.verdict === 'Detected' ? 'WARN' : 'INFO',
    summary: analysis?.nextAction || analysis?.correlation || '',
    top_anomaly: top.label || analysis?.dominant || '',
    top_suspect: top.component || analysis?.dominant || '',
    status: 'OPEN',
    created_by: 'sap-rca-workspace-v1',
  }
}

function buildParsedPayload(analysis) {
  const top = analysis?.top || {}
  return {
    tool: 'ST03N Analysis v1',
    verdict: analysis?.verdict || 'ST03N parsed',
    severity: analysis?.verdict === 'Detected' ? 'WARN' : 'INFO',
    confidence: Number(analysis?.confidence || 0),
    top_anomaly: top.label || '',
    top_suspect: top.component || analysis?.dominant || '',
    summary: analysis?.nextAction || analysis?.correlation || '',
    result_json: {
      dominant: analysis?.dominant || '',
      completeness: analysis?.completeness || 0,
      top,
      rows: (analysis?.rows || []).slice(0, 120),
      parseStatus: analysis?.parseStatus || [],
    },
  }
}

function pct(value) {
  const number = Number(value || 0)
  return Number.isFinite(number) ? `${number.toFixed(0)}%` : '0%'
}

function buildBreakdownRows(rows = []) {
  return rows.slice(0, 10).map((row, index) => {
    const response = Math.max(0, Number(row.responseMs || 0))
    const db = Math.max(0, Number(row.dbMs || 0))
    const cpu = Math.max(0, Number(row.cpuMs || 0))
    const wait = Math.max(0, Number(row.waitMs || 0))
    const load = Math.max(0, response - db - cpu - wait)
    return {
      name: `${index + 1}. ${String(row.label || 'workload').slice(0, 18)}`,
      response,
      db,
      cpu,
      wait,
      load,
      score: row.score || 0,
      component: row.component || 'Unknown',
      fullLabel: row.label || '',
    }
  })
}

export default function ToolSt03nAnalysis2026() {
  const [files, setFiles] = React.useState([])
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('Upload ST03N pack to begin workload analysis.')
  const [analysis, setAnalysis] = React.useState(() => loadJson(CACHE_KEY, null))
  const caseLink = useCaseHistoryLink({
    storageKey: CASE_KEY,
    buildCasePayload,
    buildParsedPayload,
    defaultCaseTitle: 'ST03N RCA Case',
    toolName: 'ST03N Analysis v1',
    uploadTags: ['st03n', 'rca-v1'],
    loadJson,
    saveJson,
  })

  const analyze = React.useCallback(async (nextFiles) => {
    setBusy(true)
    setStatus('Parsing ST03N workload evidence…')
    try {
      const rows = []
      const parseStatus = []
      for (const required of REQUIRED_ST03N) {
        const group = nextFiles.filter((file) => classifySt03nFile(file.name) === required.key)
        if (!group.length) {
          parseStatus.push({ key: required.key, label: required.label, ok: false, rows: 0, message: 'missing' })
          continue
        }
        for (const file of group) {
          const parsed = await parseSt03nFile(file, REQUIRED_ST03N)
          rows.push(...parsed.rows)
          parseStatus.push(parsed.status)
        }
      }
      rows.sort((a, b) => b.score - a.score)
      const result = buildSt03nAnalysis(
        nextFiles.map((file) => ({ name: file.name, size: file.size })),
        parseStatus,
        rows,
        null,
      )
      setAnalysis(result)
      saveJson(CACHE_KEY, result)
      setStatus('Analysis complete.')
    } catch (error) {
      setStatus(error?.message || 'Failed to parse ST03N evidence.')
    } finally {
      setBusy(false)
    }
  }, [])

  const onFiles = React.useCallback(async (fileList) => {
    setBusy(true)
    try {
      const expanded = await expandSt03nFiles(fileList)
      setFiles(expanded)
      await analyze(expanded)
    } catch (error) {
      setStatus(error?.message || 'Failed to read ST03N upload.')
      setBusy(false)
    }
  }, [analyze])

  const top = analysis?.top || null
  const parsedOk = analysis?.parseStatus?.filter((item) => item.ok).length || 0
  const breakdown = React.useMemo(() => buildBreakdownRows(analysis?.rows || []), [analysis])
  const offenders = analysis?.rows?.slice(0, 8) || []
  const dbShare = top?.responseMs > 0 ? (top.dbMs / top.responseMs) * 100 : 0
  const waitShare = top?.responseMs > 0 ? (top.waitMs / top.responseMs) * 100 : 0

  return (
    <section className="rca26Shell">
      <div className="rca26Inner">
        <header className="rca26Head">
          <div>
            <h1>ST03N Workload Analysis</h1>
            <p>Workload contribution, response-time decomposition, and top SAP offenders.</p>
          </div>
          <label className="rca26Upload">
            <input type="file" multiple accept=".zip,.xlsx,.xls,.csv" onChange={(event) => onFiles(event.target.files)} />
            {busy ? 'Analyzing…' : 'Upload ST03N Pack'}
          </label>
        </header>

        <section className="rca26Kpis">
          <article className="rca26Kpi good"><span>Verdict</span><strong>{analysis?.verdict || 'Waiting'}</strong><small>{analysis ? analysis.correlation : status}</small></article>
          <article className="rca26Kpi info"><span>Dominant component</span><strong>{analysis?.dominant || 'Unknown'}</strong><small>{top ? `Top: ${top.label}` : 'No workload yet'}</small></article>
          <article className="rca26Kpi good"><span>Confidence</span><strong>{analysis?.confidence || 0}%</strong><small>{analysis?.correlation || 'Pending evidence'}</small></article>
          <article className="rca26Kpi good"><span>Completeness</span><strong>{analysis?.completeness || 0}%</strong><small>{parsedOk}/{REQUIRED_ST03N.length} evidence groups parsed</small></article>
          <article className="rca26Kpi critical"><span>Baseline deviation</span><strong>Not available</strong><small>Requires a separate baseline window</small></article>
        </section>

        <div className="rca26Grid two">
          <section className="rca26Panel">
            <div className="rca26PanelHead"><div><h2>Response Time Decomposition</h2><p>Top workloads split into DB, CPU, wait, and residual response time.</p></div></div>
            {breakdown.length ? (
              <div className="rca26Chart tall">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={breakdown} margin={{ top: 8, right: 18, left: 0, bottom: 58 }}>
                    <CartesianGrid strokeDasharray="3 6" vertical={false} />
                    <XAxis dataKey="name" angle={-28} textAnchor="end" interval={0} height={70} />
                    <YAxis />
                    <Tooltip formatter={(value) => `${fmt(value, 0)} ms`} />
                    <Legend />
                    <Bar stackId="a" dataKey="db" name="DB" fill="#36d98b" />
                    <Bar stackId="a" dataKey="cpu" name="CPU" fill="#f4b942" />
                    <Bar stackId="a" dataKey="wait" name="Wait" fill="#9d79ff" />
                    <Bar stackId="a" dataKey="load" name="Other" fill="#26d3d1" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <div className="rca26Empty">Upload ST03N evidence to render workload decomposition.</div>}
          </section>

          <section className="rca26Panel">
            <div className="rca26PanelHead"><div><h2>Interpretation</h2><p>Evidence-backed direction without inventing a missing baseline.</p></div></div>
            {analysis ? (
              <div className="rca26Insight">
                <span className="rca26InsightBadge">Current finding</span>
                <h3>{top?.label || 'Workload'} is <em>{top?.component || analysis.dominant}</em>.</h3>
                <div className="rca26Reason">
                  <div><b>✓</b><span>Response {fmt(top?.responseMs, 0)} ms · DB share {pct(dbShare)} · Wait share {pct(waitShare)}.</span></div>
                  <div><b>✓</b><span>{analysis.completeness}% evidence completeness across the required ST03N pack.</span></div>
                  <div><b>✓</b><span>{analysis.rows?.length || 0} parsed workload rows support ranking and drill-down.</span></div>
                </div>
                <div className="rca26Note"><b>Next validation:</b> {analysis.nextAction || 'Validate the top workload against DB, CPU, wait, and supporting log evidence.'}</div>
              </div>
            ) : <div className="rca26Empty">No ST03N finding yet.</div>}
          </section>
        </div>

        <div className="rca26Grid two">
          <section className="rca26Panel">
            <div className="rca26PanelHead"><div><h2>Top Workload Offenders</h2><p>Ranked by the current parser score; raw metrics stay visible for validation.</p></div></div>
            <div className="rca26Bars">
              {offenders.length ? offenders.slice(0, 7).map((row) => (
                <div className="rca26BarRow" key={`${row.fileName}-${row.label}`}>
                  <label title={row.label}>{row.label}</label>
                  <div className="rca26BarTrack"><div className="rca26BarFill" style={{ width: `${Math.max(2, Math.min(100, row.score || 0))}%` }} /></div>
                  <strong>{row.score || 0}</strong>
                </div>
              )) : <div className="rca26Empty">No workload rows.</div>}
            </div>
          </section>

          <section className="rca26Panel">
            <div className="rca26PanelHead"><div><h2>Workload Details</h2><p>Response / DB / CPU / wait metrics for top objects.</p></div></div>
            <div className="rca26TableWrap">
              <table className="rca26Table">
                <thead><tr><th>Object</th><th>Response</th><th>DB</th><th>CPU</th><th>Wait</th><th>Type</th></tr></thead>
                <tbody>
                  {offenders.map((row) => <tr key={`${row.kind}-${row.fileName}-${row.label}`}><td title={row.label}>{String(row.label).slice(0, 32)}</td><td>{fmt(row.responseMs, 0)} ms</td><td>{fmt(row.dbMs, 0)} ms</td><td>{fmt(row.cpuMs, 0)} ms</td><td>{fmt(row.waitMs, 0)} ms</td><td>{row.component}</td></tr>)}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <section className="rca26Case">
          <div><span>Analysis case</span><strong>{caseLink.caseId || 'Not linked'}</strong><small>{files.length} file(s) in current upload</small></div>
          <div className="rca26CaseActions"><a className="rca26Link" href="#/cases">History</a><button className="rca26Btn primary" type="button" onClick={() => document.getElementById('st03n-case-v1')?.toggleAttribute('open')}>Manage case</button></div>
        </section>
        <details className="rca26Disclosure" id="st03n-case-v1">
          <summary>Case & evidence persistence</summary>
          <div className="rca26DisclosureBody"><CaseLinkPanel title="ST03N case" description="Create or link a case only after validating the workload finding." caseId={caseLink.caseId} caseTitle={caseLink.caseTitle} recentCases={caseLink.recentCases} savingCase={caseLink.savingCase} creatingCase={caseLink.creatingCase} saveStatus={caseLink.saveStatus} onCaseIdChange={caseLink.setCaseId} onCaseTitleChange={caseLink.setCaseTitle} onCreateCase={() => caseLink.createLinkedCase(analysis)} onSaveCurrent={() => caseLink.persistAnalysis(analysis, files)} hasAnalysis={Boolean(analysis)} saveLabel="Save ST03N analysis" titlePlaceholder="Contoh: PRD slow response ST03N RCA" /></div>
        </details>
      </div>
    </section>
  )
}
