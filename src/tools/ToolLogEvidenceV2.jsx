import React from 'react'
import CaseLinkPanel from '../features/cases/CaseLinkPanel.jsx'
import useCaseHistoryLink from '../features/cases/useCaseHistoryLink.js'
import {
  buildOwnerAction,
  expandZipAwareFiles,
  fileExt,
  latestRcaSession,
  loadJson,
  safe,
  saveJson,
} from './evidence-utils.js'
import { buildLogEvidenceReportText } from './log-evidence-report.js'
import {
  EmptyState,
  EvidenceServerPanel,
  SessionBanner,
  UploadedFilesPanel,
} from './EvidenceDecisionKit.jsx'
import EvidenceToolbar from './EvidenceToolbar.jsx'
import ErrorEvidenceRanking from './logtriage/components/ErrorEvidenceRanking.jsx'
import JobProgramMappingPanel from './logtriage/components/JobProgramMappingPanel.jsx'
import PrimaryErrorPanel from './logtriage/components/PrimaryErrorPanel.jsx'
import ScoringBreakdownPanel from './logtriage/components/ScoringBreakdownPanel.jsx'
import SummaryStrip from './logtriage/components/SummaryStrip.jsx'
import { runEvidenceAnalysis } from './useEvidenceUpload.js'
import './ToolEvidenceSpecialist.css'

const LogEvidenceCharts = React.lazy(() => import('./LogEvidenceCharts.jsx'))

const CACHE_KEY = 'sap_log_evidence_v2_cache'
const CASE_KEY = 'sap_log_evidence_v2_case_id'
const CASE_SID_KEY = 'sap_log_evidence_v2_case_sid'
const CASE_ENV_KEY = 'sap_log_evidence_v2_case_environment'
const ENVIRONMENT_OPTIONS = ['', 'PRD', 'QAS', 'DEV', 'DR', 'SBX', 'LAB']

async function expandFiles(fileList) {
  const expanded = await expandZipAwareFiles(fileList, ['log', 'txt', 'csv'])
  return expanded.filter((file) => ['log', 'txt', 'csv'].includes(fileExt(file.name)))
}

function normalizeSid(value = '') {
  return safe(value).trim().toUpperCase().replace(/[^A-Z0-9_/-]/g, '').slice(0, 12)
}

function normalizeEnvironment(value = '') {
  const env = safe(value).trim().toUpperCase()
  return ENVIRONMENT_OPTIONS.includes(env) ? env : ''
}

function parseWpRows(text = '', fileName = '') {
  const snapshot = text.match(/snapshot\s*@\s*([^\n]+)/i)?.[1]?.trim() || ''
  const timeLabel = snapshot.split(' ')[1]?.slice(0, 5) || snapshot || fileName
  const host = text.match(/Hostname\s*:\s*(\S+)/i)?.[1]?.trim() || text.match(/##\s*WP-SCOUT\s*@\s*(\S+)/i)?.[1]?.trim() || 'UNKNOWN'
  const rows = []
  const rx = /^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+([\d.]+)\s+([\d.]+G)\s+([\d.]+)\s+([RS])\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(CRIT|WARN|OK)\s+(\S+)\s+(\S+)\s+(.*)$/
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
    rows.push({
      fileName,
      snapshot,
      timeLabel,
      host,
      pid: m[1],
      wp: m[3],
      type: m[4],
      cpu: Number(m[5]) || 0,
      rssGb: Number(m[7]) || 0,
      state: m[8],
      className: m[14],
      program,
      errorCode,
      jobName,
      lineNo: 0,
      source: 'WP-SCOUT',
    })
  })
  return rows
}

function severityFromAnalysis(result) {
  const primary = result?.primary || {}
  if (primary.critHits > 0) return 'CRIT'
  if ((primary.hits || 0) > 0) return 'WARN'
  return 'INFO'
}

function buildParsedPayload(result, context = {}) {
  const primary = result?.primary || {}
  const sid = normalizeSid(context.sid)
  const environment = normalizeEnvironment(context.environment)
  return {
    tool: 'Log Evidence V2',
    verdict: primary.name || 'Log evidence parsed',
    severity: severityFromAnalysis(result),
    confidence: Number(result?.confidence || 0),
    top_anomaly: primary.name || '',
    top_suspect: primary.family || primary.owner || '',
    summary: result?.summary || primary.meaning || 'Log evidence parsed and saved to Case History.',
    sid,
    environment,
    result_json: {
      sid,
      environment,
      summary: result?.summary || '',
      nextAction: result?.nextAction || '',
      confidenceText: result?.confidenceText || '',
      primary,
      infra_saturation: result?.infra_saturation || null,
      ownership_direction: result?.ownership_direction || null,
      system_resources: (result?.system_resources || result?.resources || []).slice(-30),
      errorGroups: (result?.errorGroups || []).slice(0, 20),
      jobGroups: (result?.jobGroups || []).slice(0, 20),
      programGroups: (result?.programGroups || []).slice(0, 20),
      timeline: (result?.timeline || []).slice(0, 50),
      files: result?.files || [],
      rowCount: result?.rows?.length || 0,
    },
  }
}

function buildCasePayload(analysis, title, context = {}) {
  const primary = analysis?.primary || {}
  return {
    title,
    sid: normalizeSid(context.sid),
    environment: normalizeEnvironment(context.environment),
    severity: analysis ? severityFromAnalysis(analysis) : 'INFO',
    summary: analysis?.summary || '',
    top_anomaly: primary.name || '',
    top_suspect: primary.family || primary.owner || '',
    status: 'OPEN',
    created_by: 'sap-rca-workspace',
  }
}

function Group({ title, rows = [] }) {
  return <section className="evidencePanel"><h2>{title}</h2><div className="evidenceList compact">{rows.slice(0, 8).map((item) => <div key={item.name}><b>{item.name}</b><span>hits {item.hits} · CRIT {item.critHits}</span><small>{item.family || ''} {item.examples?.join(' · ')}</small></div>)}</div></section>
}

function IncidentCockpitStrip({ analysis, caseId, status }) {
  const primary = analysis?.primary || {}
  const infra = analysis?.infra_saturation || {}
  const owner = analysis?.ownership_direction || {}
  const severity = severityFromAnalysis(analysis || {})
  const confidence = Number(analysis?.confidence || 0)
  const bottleneck = infra?.dominant || 'N/A'
  const primaryOwner = owner?.primary_owner || primary?.owner || infra?.owner || 'UNKNOWN'

  return (
    <section className="incidentCockpitStrip" data-severity={severity.toLowerCase()}>
      <div><span>Severity</span><strong>{analysis ? severity : 'WAITING'}</strong></div>
      <div><span>Confidence</span><strong>{analysis ? `${confidence}%` : '—'}</strong></div>
      <div><span>Owner</span><strong>{analysis ? primaryOwner : 'PENDING'}</strong></div>
      <div><span>Bottleneck</span><strong>{analysis ? bottleneck : 'N/A'}</strong></div>
      <div><span>Case</span><strong>{caseId || 'Not linked'}</strong></div>
      <small>{analysis?.summary || status}</small>
    </section>
  )
}

function InfraSaturationPanel({ analysis }) {
  const infra = analysis?.infra_saturation
  const owner = analysis?.ownership_direction
  if (!analysis || !infra) return null

  const metricRows = [
    ['CPU', infra.cpu?.max ?? 0, infra.cpu?.score ?? 0],
    ['MEM', infra.memory?.max ?? 0, infra.memory?.score ?? 0],
    ['SWAP', infra.swap?.max ?? 0, infra.swap?.score ?? 0],
  ]

  return (
    <section className="evidencePanel infraSaturationPanel" data-severity={String(infra.severity || 'INFO').toLowerCase()}>
      <div className="intelHead"><span>Infra Saturation</span><strong>{infra.severity || 'INFO'} · {infra.score || 0}%</strong></div>
      <p className="mutedText">{infra.verdict || 'No infra saturation verdict available.'}</p>
      <div className="infraMetricGrid">
        {metricRows.map(([label, maxValue, score]) => (
          <div className="infraMetricCard" key={label}><span>{label}</span><strong>{maxValue}%</strong><small>pressure score {score}</small></div>
        ))}
      </div>
      <div className="evidenceList compact">
        <div><b>Dominant Bottleneck</b><span>{infra.dominant || 'Not confirmed'}</span></div>
        <div><b>Ownership Direction</b><span>{owner?.primary_owner || infra.owner || 'UNKNOWN'}{owner?.secondary_owner ? ` · secondary ${owner.secondary_owner}` : ''}</span></div>
        <div><b>Recommended Validation</b><span>{infra.nextAction || analysis?.nextAction || 'Validate SAP and OS evidence in the same incident window.'}</span></div>
      </div>
      {infra.signals?.length ? <small>{infra.signals.slice(0, 3).join(' · ')}</small> : null}
    </section>
  )
}

function MetadataFields({ caseSid, caseEnvironment, onCaseSidChange, onCaseEnvironmentChange }) {
  return (
    <>
      <label>
        <b>SID</b>
        <input value={caseSid} onChange={(event) => onCaseSidChange(normalizeSid(event.target.value))} placeholder="Contoh: H1P" />
      </label>
      <label>
        <b>Environment</b>
        <select value={caseEnvironment} onChange={(event) => onCaseEnvironmentChange(event.target.value)}>
          {ENVIRONMENT_OPTIONS.map((item) => <option key={item || 'blank'} value={item}>{item || 'Not set'}</option>)}
        </select>
      </label>
    </>
  )
}

export default function ToolLogEvidenceV2() {
  const [session] = React.useState(latestRcaSession)
  const [files, setFiles] = React.useState([])
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('Upload WP-SCOUT/SM21/ST22/dev_w/job logs or ZIP to validate error evidence.')
  const [analysis, setAnalysis] = React.useState(() => loadJson(CACHE_KEY, null))
  const [serverInfo, setServerInfo] = React.useState(null)
  const [caseSid, setCaseSid] = React.useState(() => normalizeSid(loadJson(CASE_SID_KEY, '')))
  const [caseEnvironment, setCaseEnvironment] = React.useState(() => normalizeEnvironment(loadJson(CASE_ENV_KEY, '')))
  const caseContext = React.useMemo(() => ({ sid: caseSid, environment: caseEnvironment }), [caseSid, caseEnvironment])
  const caseLink = useCaseHistoryLink({
    storageKey: CASE_KEY,
    buildCasePayload,
    buildParsedPayload: buildParsedPayload,
    defaultCaseTitle: 'Log Evidence RCA Case',
    toolName: 'Log Evidence V2',
    uploadTags: ['log-evidence-v2', 'sap-rca'],
    saveJson,
  })

  React.useEffect(() => {
    let active = true
    import('../evidence-api-client.js')
      .then(({ listEvidence }) => listEvidence({ tool: 'investigation', limit: 5 }))
      .then((response) => { if (active) setServerInfo(response) })
      .catch(() => { if (active) setServerInfo({ ok: false }) })
    return () => { active = false }
  }, [])

  React.useEffect(() => { saveJson(CASE_SID_KEY, caseSid || '') }, [caseSid])
  React.useEffect(() => { saveJson(CASE_ENV_KEY, caseEnvironment || '') }, [caseEnvironment])

  const analyze = async (nextFiles = files) => {
    setBusy(true)
    setStatus('Parsing log evidence…')
    try {
      const result = await runEvidenceAnalysis({ files: nextFiles, parseWpRows, serverInfo })
      setAnalysis(result)
      saveJson(CACHE_KEY, result)
      setStatus('Log evidence analysis complete. Create or select a case, then click Save to Case History.')
    } catch (error) {
      setStatus(error?.message || 'Failed to parse logs.')
    } finally {
      setBusy(false)
    }
  }

  const onFiles = async (fileList) => {
    setBusy(true)
    try {
      const expanded = await expandFiles(fileList)
      setFiles(expanded)
      await analyze(expanded)
    } catch (error) {
      setStatus(error?.message || 'Failed to read upload.')
    } finally {
      setBusy(false)
    }
  }

  const primary = analysis?.primary
  const chartData = analysis?.errorGroups?.slice(0, 10).map((item) => ({ name: item.name.slice(0, 16), hits: item.hits, crit: item.critHits })) || []

  return <section className="evidenceToolShell refinedTool"><header className="evidenceHero compactEvidenceHero"><div><a href="#/tool/logs">Log Evidence Analyzer V2</a><h1>Error pattern drilldown.</h1><p>Decision-first log analysis: primary error, family, owner direction, job/program mapping, and occurrence timeline.</p></div><label className="evidenceUpload"><input type="file" multiple accept=".zip,.log,.txt,.csv" onChange={(event) => onFiles(event.target.files)} />{busy ? 'Parsing…' : 'Upload Log Evidence'}</label></header><SessionBanner session={session} /><EvidenceToolbar analysis={analysis} cacheKey={CACHE_KEY} reportText={buildLogEvidenceReportText(analysis)} filenamePrefix="sap-log-evidence-v2" /><IncidentCockpitStrip analysis={analysis} caseId={caseLink.caseId} status={status} /><div className="evidenceGrid"><CaseLinkPanel title="Case History Link" description="Upload analyzes only. Create or select a case, then click Save to Case History. SID and environment are stored with the case and parsed RCA result." caseId={caseLink.caseId} caseTitle={caseLink.caseTitle} recentCases={caseLink.recentCases} savingCase={caseLink.savingCase} saveStatus={caseLink.saveStatus} onCaseIdChange={caseLink.setCaseId} onCaseTitleChange={caseLink.setCaseTitle} onCreateCase={() => caseLink.createLinkedCase(analysis, caseContext)} onSaveCurrent={() => caseLink.persistAnalysis(analysis, files, caseContext)} hasAnalysis={Boolean(analysis)} saveLabel="Save to Case History" titlePlaceholder="Contoh: H1P PRD CONVT_NO_NUMBER RCA"><MetadataFields caseSid={caseSid} caseEnvironment={caseEnvironment} onCaseSidChange={setCaseSid} onCaseEnvironmentChange={setCaseEnvironment} /></CaseLinkPanel><section className="evidencePanel"><h2>Persistence Flow</h2><div className="evidenceList compact"><div><b>Selected Case</b><span>{caseLink.caseId || 'Not linked yet'}</span></div><div><b>Case Metadata</b><span>{[caseSid || 'SID not set', caseEnvironment || 'environment not set'].join(' · ')}</span></div><div><b>Required Order</b><span>Upload/analyze → create/select case → save explicitly</span></div><div><b>Mobile Path</b><span>Open #/cases/{caseLink.caseId || ':id'} after save</span></div></div></section></div><SummaryStrip analysis={analysis} primary={primary} status={status} />{analysis && <InfraSaturationPanel analysis={analysis} />}{analysis && <ScoringBreakdownPanel analysis={analysis} />}<div className="evidenceGrid"><PrimaryErrorPanel primary={primary} status={status} /><JobProgramMappingPanel primary={primary} /></div>{analysis ? <div className="evidenceGrid wide"><React.Suspense fallback={<section className="evidencePanel"><h2>Loading Charts</h2><p>Preparing evidence visualization…</p></section>}><LogEvidenceCharts chartData={chartData} timeline={analysis.timeline} /></React.Suspense><ErrorEvidenceRanking errorGroups={analysis.errorGroups} /></div> : <EmptyState title="How to use this analyzer"><p>Upload WP-SCOUT logs, SM21/ST22 text, dev_w trace, job log text, or a ZIP containing logs. Nothing is saved until you explicitly create/select a case and click Save to Case History.</p><ol><li>Upload and analyze evidence.</li><li>Create or select one incident/RCA case.</li><li>Save parsed summary and evidence to Case History.</li><li>Use owner direction to route action.</li></ol></EmptyState>}{analysis && <div className="evidenceGrid triple"><Group title="Top JobName" rows={analysis.jobGroups} /><Group title="Top Program" rows={analysis.programGroups} /><Group title="Recommended Action" rows={(analysis.errorGroups || []).slice(0, 8).map((item) => ({ name: item.name, hits: item.hits, critHits: item.critHits, family: `Focus ${item.owner}`, examples: [buildOwnerAction(item)] }))} /></div>}<div className="evidenceGrid"><UploadedFilesPanel files={files} /><EvidenceServerPanel serverInfo={serverInfo} /></div></section>
}
