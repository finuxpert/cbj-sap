import React from 'react'
import {
  buildOwnerAction,
  expandZipAwareFiles,
  fileExt,
  fmt,
  latestRcaSession,
  loadJson,
  safe,
  saveJson,
} from './evidence-utils.js'
import { buildLogEvidenceReportText } from './log-evidence-report.js'
import {
  DecisionCard,
  EmptyState,
  EvidenceServerPanel,
  SessionBanner,
  UploadedFilesPanel,
} from './EvidenceDecisionKit.jsx'
import EvidenceToolbar from './EvidenceToolbar.jsx'
import { runEvidenceAnalysis } from './useEvidenceUpload.js'
import './ToolEvidenceSpecialist.css'

const LogEvidenceCharts = React.lazy(() => import('./LogEvidenceCharts.jsx'))

const CACHE_KEY = 'sap_log_evidence_v2_cache'

async function expandFiles(fileList) {
  const expanded = await expandZipAwareFiles(fileList, ['log', 'txt', 'csv'])
  return expanded.filter((file) => ['log', 'txt', 'csv'].includes(fileExt(file.name)))
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

function Group({ title, rows = [] }) {
  return <section className="evidencePanel"><h2>{title}</h2><div className="evidenceList compact">{rows.slice(0, 8).map((item) => <div key={item.name}><b>{item.name}</b><span>hits {item.hits} · CRIT {item.critHits}</span><small>{item.family || ''} {item.examples?.join(' · ')}</small></div>)}</div></section>
}

export default function ToolLogEvidenceV2() {
  const [session] = React.useState(latestRcaSession)
  const [files, setFiles] = React.useState([])
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('Upload WP-SCOUT/SM21/ST22/dev_w/job logs or ZIP to validate error evidence.')
  const [analysis, setAnalysis] = React.useState(() => loadJson(CACHE_KEY, null))
  const [serverInfo, setServerInfo] = React.useState(null)

  React.useEffect(() => {
    let active = true
    import('../evidence-api-client.js')
      .then(({ listEvidence }) => listEvidence({ tool: 'investigation', limit: 5 }))
      .then((response) => { if (active) setServerInfo(response) })
      .catch(() => { if (active) setServerInfo({ ok: false }) })
    return () => { active = false }
  }, [])

  const analyze = async (nextFiles = files) => {
    setBusy(true)
    setStatus('Parsing log evidence…')

    try {
      const result = await runEvidenceAnalysis({
        files: nextFiles,
        parseWpRows,
        serverInfo,
      })

      setAnalysis(result)
      saveJson(CACHE_KEY, result)
      setStatus('Log evidence analysis complete.')
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

  return <section className="evidenceToolShell refinedTool"><header className="evidenceHero compactEvidenceHero"><div><span>Log Evidence Analyzer V2</span><h1>Error pattern drilldown.</h1><p>Decision-first log analysis: primary error, family, owner direction, job/program mapping, and occurrence timeline.</p></div><label className="evidenceUpload"><input type="file" multiple accept=".zip,.log,.txt,.csv" onChange={(event) => onFiles(event.target.files)} />{busy ? 'Parsing…' : 'Upload Log Evidence'}</label></header><SessionBanner session={session} /><EvidenceToolbar analysis={analysis} cacheKey={CACHE_KEY} reportText={buildLogEvidenceReportText(analysis)} filenamePrefix="sap-log-evidence-v2" /><section className="decisionBoard"><DecisionCard label="Primary Error" value={primary?.name || 'Pending'} hint={analysis?.summary || status} tone={primary ? 'good' : ''} /><DecisionCard label="Error Family" value={primary?.family || 'Unknown'} hint={primary?.meaning || 'Upload logs to classify error family'} tone="blue" /><DecisionCard label="Owner Direction" value={primary?.owner || 'Pending'} hint={analysis?.nextAction || 'Based only on uploaded evidence pattern'} /><DecisionCard label="Confidence" value={`${analysis?.confidence || 0}%`} hint={analysis?.confidenceText || `${analysis?.rows?.length || 0} parsed rows`} /></section><div className="evidenceGrid"><section className="evidencePanel"><h2>Primary Error Explanation</h2>{primary ? <><p><b>{primary.name}</b> points to <b>{primary.family}</b>.</p><p>{primary.meaning}</p><div className="confidenceRows"><span>Hits<b>{primary.hits}</b></span><span>CRIT<b>{primary.critHits}</b></span><span>Files<b>{primary.files?.length || 0}</b></span></div></> : <p>{status}</p>}</section><section className="evidencePanel"><h2>Error → Job / Program Mapping</h2>{primary ? <div className="evidenceList compact"><div><b>Jobs</b><span>{primary.jobs?.join(' · ') || 'No job extracted'}</span></div><div><b>Programs</b><span>{primary.programs?.join(' · ') || 'No program extracted'}</span></div><div><b>Seen at</b><span>{primary.times?.join(', ') || 'No timestamp extracted'}</span></div></div> : <p>Upload logs to map errors to jobs and programs.</p>}</section></div>{analysis ? <div className="evidenceGrid wide"><React.Suspense fallback={<section className="evidencePanel"><h2>Loading Charts</h2><p>Preparing evidence visualization…</p></section>}><LogEvidenceCharts chartData={chartData} timeline={analysis.timeline} /></React.Suspense><section className="evidencePanel"><h2>Error Evidence Ranking</h2><div className="evidenceList">{analysis.errorGroups.slice(0, 12).map((item) => <div key={item.name}><b>{item.name}</b><span>{item.family} · owner {item.owner}</span><small>hits {item.hits} · CRIT {item.critHits} · max CPU {fmt(item.maxCpu)}% · {item.examples.join(' · ')}</small></div>)}</div></section></div> : <EmptyState title="How to use this analyzer"><p>Upload WP-SCOUT logs, SM21/ST22 text, dev_w trace, job log text, or a ZIP containing logs.</p><ol><li>Find strongest ErrorCode.</li><li>Map error to job/program.</li><li>Use owner direction to route action.</li></ol></EmptyState>}{analysis && <div className="evidenceGrid triple"><Group title="Top JobName" rows={analysis.jobGroups} /><Group title="Top Program" rows={analysis.programGroups} /><Group title="Recommended Action" rows={(analysis.errorGroups || []).slice(0, 8).map((item) => ({ name: item.name, hits: item.hits, critHits: item.critHits, family: `Focus ${item.owner}`, examples: [buildOwnerAction(item)] }))} /></div>}<div className="evidenceGrid"><UploadedFilesPanel files={files} /><EvidenceServerPanel serverInfo={serverInfo} /></div></section>
}
