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
  EmptyState,
  EvidenceServerPanel,
  SessionBanner,
  UploadedFilesPanel,
} from './EvidenceDecisionKit.jsx'
import EvidenceToolbar from './EvidenceToolbar.jsx'
import JobProgramMappingPanel from './logtriage/components/JobProgramMappingPanel.jsx'
import PrimaryErrorPanel from './logtriage/components/PrimaryErrorPanel.jsx'
import SummaryStrip from './logtriage/components/SummaryStrip.jsx'
import { runEvidenceAnalysis } from './useEvidenceUpload.js'
import './ToolEvidenceSpecialist.css'

const LogEvidenceCharts = React.lazy(() => import('./LogEvidenceCharts.jsx'))

const CACHE_KEY = 'sap_log_evidence_v2_cache'
const CASE_KEY = 'sap_log_evidence_v2_case_id'

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

function severityFromAnalysis(result) {
  const primary = result?.primary || {}
  if (primary.critHits > 0) return 'CRIT'
  if ((primary.hits || 0) > 0) return 'WARN'
  return 'INFO'
}

function buildParsedPayload(result) {
  const primary = result?.primary || {}
  return {
    tool: 'Log Evidence V2',
    verdict: primary.name || 'Log evidence parsed',
    severity: severityFromAnalysis(result),
    confidence: Number(result?.confidence || 0),
    top_anomaly: primary.name || '',
    top_suspect: primary.family || primary.owner || '',
    summary: result?.summary || primary.meaning || 'Log evidence parsed and saved to Case History.',
    result_json: {
      summary: result?.summary || '',
      nextAction: result?.nextAction || '',
      confidenceText: result?.confidenceText || '',
      primary,
      errorGroups: (result?.errorGroups || []).slice(0, 20),
      jobGroups: (result?.jobGroups || []).slice(0, 20),
      programGroups: (result?.programGroups || []).slice(0, 20),
      timeline: (result?.timeline || []).slice(0, 50),
      files: result?.files || [],
      rowCount: result?.rows?.length || 0,
    },
  }
}

function normalizeCaseId(response) {
  const candidate = response?.case || response?.item || response?.data || response
  return candidate?.id || candidate?.case_no || response?.id || response?.case_id || response?.caseNo || ''
}

function normalizeCaseList(response) {
  if (Array.isArray(response)) return response
  if (Array.isArray(response?.items)) return response.items
  if (Array.isArray(response?.cases)) return response.cases
  if (Array.isArray(response?.data)) return response.data
  return []
}

function caseItemId(item) {
  return item?.id || item?.case_no || item?.case_id || item?.caseNo || ''
}

function findFallbackCase(items = [], title = '') {
  const wanted = safe(title).toLowerCase()
  if (!items.length) return null
  if (!wanted) return items[0]
  return items.find((item) => safe(item.title).toLowerCase() === wanted) || items[0]
}

function Group({ title, rows = [] }) {
  return <section className="evidencePanel"><h2>{title}</h2><div className="evidenceList compact">{rows.slice(0, 8).map((item) => <div key={item.name}><b>{item.name}</b><span>hits {item.hits} · CRIT {item.critHits}</span><small>{item.family || ''} {item.examples?.join(' · ')}</small></div>)}</div></section>
}

function CaseLinkPanel({
  caseId,
  caseTitle,
  recentCases,
  savingCase,
  saveStatus,
  onCaseIdChange,
  onCaseTitleChange,
  onCreateCase,
  onSaveCurrent,
  hasAnalysis,
}) {
  return (
    <section className="evidencePanel">
      <h2>Case History Link</h2>
      <p className="mutedText">Pilih atau buat case supaya hasil parsing Log Evidence tersimpan dan bisa dibuka ulang dari #/cases maupun mobile.</p>
      <div className="evidenceList compact">
        <label>
          <b>Existing Case</b>
          <select value={caseId} onChange={(event) => onCaseIdChange(event.target.value)}>
            <option value="">Not linked</option>
            {recentCases.map((item) => {
              const id = caseItemId(item)
              return <option key={id || item.title} value={id}>{(item.case_no || id)} · {item.title || 'Untitled'}</option>
            })}
          </select>
        </label>
        <label>
          <b>New Case Title</b>
          <input
            value={caseTitle}
            onChange={(event) => onCaseTitleChange(event.target.value)}
            placeholder="Contoh: SAP job cancelled / dev_w error RCA"
          />
        </label>
      </div>
      <div className="caseHistoryActions">
        <button className="btn" type="button" onClick={onCreateCase} disabled={savingCase}>
          {savingCase ? 'Creating…' : 'Create Case'}
        </button>
        <button className="btn primary" type="button" onClick={onSaveCurrent} disabled={savingCase || !caseId || !hasAnalysis}>
          {savingCase ? 'Saving…' : 'Save Parsed Summary'}
        </button>
      </div>
      {saveStatus && <small>{saveStatus}</small>}
    </section>
  )
}

export default function ToolLogEvidenceV2() {
  const [session] = React.useState(latestRcaSession)
  const [files, setFiles] = React.useState([])
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('Upload WP-SCOUT/SM21/ST22/dev_w/job logs or ZIP to validate error evidence.')
  const [analysis, setAnalysis] = React.useState(() => loadJson(CACHE_KEY, null))
  const [serverInfo, setServerInfo] = React.useState(null)
  const [recentCases, setRecentCases] = React.useState([])
  const [caseId, setCaseId] = React.useState(() => loadJson(CASE_KEY, ''))
  const [caseTitle, setCaseTitle] = React.useState('')
  const [savingCase, setSavingCase] = React.useState(false)
  const [saveStatus, setSaveStatus] = React.useState('')

  const loadCases = React.useCallback(async () => {
    try {
      const { listMobileCases } = await import('../evidence-api-client.js')
      const response = await listMobileCases({ limit: 20 })
      const items = normalizeCaseList(response)
      setRecentCases(items)
      return items
    } catch {
      setRecentCases([])
      return []
    }
  }, [])

  React.useEffect(() => {
    let active = true
    import('../evidence-api-client.js')
      .then(({ listEvidence }) => listEvidence({ tool: 'investigation', limit: 5 }))
      .then((response) => { if (active) setServerInfo(response) })
      .catch(() => { if (active) setServerInfo({ ok: false }) })
    return () => { active = false }
  }, [])

  React.useEffect(() => {
    loadCases()
  }, [loadCases])

  React.useEffect(() => {
    saveJson(CASE_KEY, caseId || '')
  }, [caseId])

  const persistAnalysis = React.useCallback(async (result, nextFiles = files) => {
    if (!caseId || !result) return
    setSavingCase(true)
    setSaveStatus('Saving parsed summary to Case History…')
    try {
      const { saveParsedResult, uploadEvidence } = await import('../evidence-api-client.js')
      const saved = await saveParsedResult(caseId, buildParsedPayload(result))
      if (saved?.ok === false) throw new Error(saved?.detail || saved?.raw || 'Failed to save parsed result')

      let uploaded = 0
      for (const file of nextFiles.slice(0, 20)) {
        const response = await uploadEvidence(file, {
          case_id: caseId,
          tool: 'Log Evidence V2',
          title: file.name,
          tags: ['log-evidence-v2', 'auto-linked'],
        })
        if (response?.ok !== false) uploaded += 1
      }

      setSaveStatus(`Saved to ${caseId}. Linked evidence files: ${uploaded}.`)
      loadCases()
    } catch (error) {
      setSaveStatus(error?.message || 'Failed to save parsed summary.')
    } finally {
      setSavingCase(false)
    }
  }, [caseId, files, loadCases])

  const createLinkedCase = React.useCallback(async () => {
    setSavingCase(true)
    setSaveStatus('Creating case…')
    try {
      const { createCase } = await import('../evidence-api-client.js')
      const primary = analysis?.primary || {}
      const title = caseTitle.trim() || primary.name || 'Log Evidence RCA Case'
      const payload = {
        title,
        severity: analysis ? severityFromAnalysis(analysis) : 'INFO',
        summary: analysis?.summary || '',
        top_anomaly: primary.name || '',
        top_suspect: primary.family || primary.owner || '',
        status: 'OPEN',
        created_by: 'sap-rca-workspace',
      }
      const response = await createCase(payload)
      if (response?.ok === false) throw new Error(response?.detail || response?.raw || 'Failed to create case')

      let nextId = normalizeCaseId(response)
      if (!nextId) {
        const refreshedCases = await loadCases()
        const fallback = findFallbackCase(refreshedCases, title)
        nextId = caseItemId(fallback)
      }
      if (!nextId) throw new Error('Case was submitted, but no selectable case id was returned. Open Cases, refresh, then select the case manually.')

      setCaseId(nextId)
      setCaseTitle('')
      setSaveStatus(`Case linked: ${nextId}`)
      loadCases()
    } catch (error) {
      setSaveStatus(error?.message || 'Failed to create case.')
    } finally {
      setSavingCase(false)
    }
  }, [analysis, caseTitle, loadCases])

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
      if (caseId) await persistAnalysis(result, nextFiles)
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

  return <section className="evidenceToolShell refinedTool"><header className="evidenceHero compactEvidenceHero"><div><a href="#/tool/logs">Log Evidence Analyzer V2</a><h1>Error pattern drilldown.</h1><p>Decision-first log analysis: primary error, family, owner direction, job/program mapping, and occurrence timeline.</p></div><label className="evidenceUpload"><input type="file" multiple accept=".zip,.log,.txt,.csv" onChange={(event) => onFiles(event.target.files)} />{busy ? 'Parsing…' : 'Upload Log Evidence'}</label></header><SessionBanner session={session} /><EvidenceToolbar analysis={analysis} cacheKey={CACHE_KEY} reportText={buildLogEvidenceReportText(analysis)} filenamePrefix="sap-log-evidence-v2" /><div className="evidenceGrid"><CaseLinkPanel caseId={caseId} caseTitle={caseTitle} recentCases={recentCases} savingCase={savingCase} saveStatus={saveStatus} onCaseIdChange={setCaseId} onCaseTitleChange={setCaseTitle} onCreateCase={createLinkedCase} onSaveCurrent={() => persistAnalysis(analysis, files)} hasAnalysis={Boolean(analysis)} /><section className="evidencePanel"><h2>Persistence Flow</h2><div className="evidenceList compact"><div><b>Selected Case</b><span>{caseId || 'Not linked yet'}</span></div><div><b>Auto-save</b><span>{caseId ? 'Enabled after parsing' : 'Create/select case first'}</span></div><div><b>Mobile Path</b><span>Open #/cases/{caseId || ':id'} after save</span></div></div></section></div><SummaryStrip analysis={analysis} primary={primary} status={status} /><div className="evidenceGrid"><PrimaryErrorPanel primary={primary} status={status} /><JobProgramMappingPanel primary={primary} /></div>{analysis ? <div className="evidenceGrid wide"><React.Suspense fallback={<section className="evidencePanel"><h2>Loading Charts</h2><p>Preparing evidence visualization…</p></section>}><LogEvidenceCharts chartData={chartData} timeline={analysis.timeline} /></React.Suspense><section className="evidencePanel"><h2>Error Evidence Ranking</h2><div className="evidenceList">{analysis.errorGroups.slice(0, 12).map((item) => <div key={item.name}><b>{item.name}</b><span>{item.family} · owner {item.owner}</span><small>hits {item.hits} · CRIT {item.critHits} · max CPU {fmt(item.maxCpu)}% · {item.examples.join(' · ')}</small></div>)}</div></section></div> : <EmptyState title="How to use this analyzer"><p>Upload WP-SCOUT logs, SM21/ST22 text, dev_w trace, job log text, or a ZIP containing logs.</p><ol><li>Find strongest ErrorCode.</li><li>Map error to job/program.</li><li>Use owner direction to route action.</li></ol></EmptyState>}{analysis && <div className="evidenceGrid triple"><Group title="Top JobName" rows={analysis.jobGroups} /><Group title="Top Program" rows={analysis.programGroups} /><Group title="Recommended Action" rows={(analysis.errorGroups || []).slice(0, 8).map((item) => ({ name: item.name, hits: item.hits, critHits: item.critHits, family: `Focus ${item.owner}`, examples: [buildOwnerAction(item)] }))} /></div>}<div className="evidenceGrid"><UploadedFilesPanel files={files} /><EvidenceServerPanel serverInfo={serverInfo} /></div></section>
}
