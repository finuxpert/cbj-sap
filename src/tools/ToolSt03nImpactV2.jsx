import React from 'react'
import CaseLinkPanel from '../features/cases/CaseLinkPanel.jsx'
import useCaseHistoryLink from '../features/cases/useCaseHistoryLink.js'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LabelList,
} from 'recharts'
import { getRecentEvidence, fmt, latestRcaSession, loadJson, saveJson } from './evidence-utils.js'
import {
  AnalysisDisclosure,
  DecisionCard,
  EmptyState,
  EvidenceServerPanel,
  EvidenceToolbar,
  SessionBanner,
  UploadedFilesPanel,
  WorkspaceTabs,
} from './EvidenceDecisionKit.jsx'
import {
  buildSt03nAnalysis,
  classifySt03nFile,
  expandSt03nFiles,
  parseSt03nFile,
  REQUIRED_ST03N,
} from './parsers/st03nParser.js'
import './ToolEvidenceSpecialist.css'

const CACHE_KEY = 'sap_st03n_impact_v2_cache'
const CASE_KEY = 'sap_st03n_impact_v2_case_id'
const VIEW_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'workload', label: 'Workload ranking' },
  { id: 'components', label: 'Components' },
  { id: 'evidence', label: 'Evidence & case' },
]

function buildReportText(analysis) {
  if (!analysis) return ''
  const top = analysis.top
  return [
    'SAP ST03N Impact Summary',
    `Verdict: ${analysis.verdict}`,
    `Confidence: ${analysis.confidence}% - ${analysis.correlation}`,
    `Completeness: ${analysis.completeness}%`,
    `Dominant Component: ${analysis.dominant}`,
    top ? `Top Evidence: ${top.label}` : 'Top Evidence: -',
    top ? `Component: ${top.component}` : 'Component: -',
    top ? `Response: ${fmt(top.responseMs, 0)}ms | DB: ${fmt(top.dbMs, 0)}ms | Wait: ${fmt(top.waitMs, 0)}ms` : '',
    `Next Action: ${analysis.nextAction}`,
  ].filter(Boolean).join('\n')
}

function shortLabel(value = '', max = 32) {
  const text = String(value || '')
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function buildSt03nCasePayload(analysis, title) {
  const top = analysis?.top || {}
  return {
    title,
    severity: analysis?.verdict === 'Detected' ? 'WARN' : 'INFO',
    summary: analysis?.nextAction || analysis?.correlation || '',
    top_anomaly: top.label || analysis?.dominant || '',
    top_suspect: top.component || analysis?.dominant || '',
    status: 'OPEN',
    created_by: 'sap-rca-workspace',
  }
}

function buildSt03nParsedPayload(analysis) {
  const top = analysis?.top || {}
  return {
    tool: 'ST03N Impact V2',
    verdict: analysis?.verdict || 'ST03N impact parsed',
    severity: analysis?.verdict === 'Detected' ? 'WARN' : 'INFO',
    confidence: Number(analysis?.confidence || 0),
    top_anomaly: top.label || analysis?.dominant || '',
    top_suspect: top.component || analysis?.dominant || '',
    summary: analysis?.nextAction || analysis?.correlation || 'ST03N impact analysis saved to Case History.',
    result_json: {
      verdict: analysis?.verdict || '',
      dominant: analysis?.dominant || '',
      completeness: analysis?.completeness || 0,
      correlation: analysis?.correlation || '',
      nextAction: analysis?.nextAction || '',
      top,
      rows: (analysis?.rows || []).slice(0, 100),
      componentRows: analysis?.componentRows || [],
      parseStatus: analysis?.parseStatus || [],
    },
  }
}

function St03nTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload || {}
  return (
    <div className="evidenceChartTooltip">
      <strong>{row.fullLabel || label}</strong>
      <span>Problem Score: {row.score}/100 · Component: {row.component || '-'}</span>
      <small>Response {fmt(row.response, 0)}ms · DB {fmt(row.db, 0)}ms · Wait {fmt(row.wait, 0)}ms.</small>
    </div>
  )
}

export default function ToolSt03nImpactV2() {
  const [session] = React.useState(latestRcaSession)
  const [files, setFiles] = React.useState([])
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('Upload ST03N pack or ZIP to validate workload impact.')
  const [analysis, setAnalysis] = React.useState(() => loadJson(CACHE_KEY, null))
  const [serverInfo, setServerInfo] = React.useState(null)
  const [activeView, setActiveView] = React.useState('overview')
  const caseLink = useCaseHistoryLink({
    storageKey: CASE_KEY,
    buildCasePayload: buildSt03nCasePayload,
    buildParsedPayload: buildSt03nParsedPayload,
    defaultCaseTitle: 'ST03N Impact RCA Case',
    toolName: 'ST03N Impact V2',
    uploadTags: ['st03n-impact-v2', 'auto-linked'],
    loadJson,
    saveJson,
  })

  React.useEffect(() => {
    let active = true
    getRecentEvidence({ tool: 'investigation', limit: 5 }).then((response) => {
      if (active) setServerInfo(response)
    })
    return () => { active = false }
  }, [])

  const detected = React.useMemo(() => {
    const map = Object.fromEntries(REQUIRED_ST03N.map((item) => [item.key, []]))
    files.forEach((file) => {
      const key = classifySt03nFile(file.name)
      if (key) map[key].push(file)
    })
    return map
  }, [files])

  const analyze = async (nextFiles = files) => {
    setBusy(true)
    setStatus('Parsing ST03N evidence…')
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
      const result = buildSt03nAnalysis(nextFiles.map((file) => ({ name: file.name, size: file.size })), parseStatus, rows, serverInfo)
      setAnalysis(result)
      saveJson(CACHE_KEY, result)
      setStatus('ST03N analysis complete. Review the finding, then link it to a case when ready.')
      setActiveView('overview')
    } catch (error) {
      setStatus(error?.message || 'Failed to analyze ST03N files.')
    } finally {
      setBusy(false)
    }
  }

  const onFiles = async (fileList) => {
    setBusy(true)
    try {
      const expanded = await expandSt03nFiles(fileList)
      setFiles(expanded)
      await analyze(expanded)
    } catch (error) {
      setStatus(error?.message || 'Failed to read upload.')
    } finally {
      setBusy(false)
    }
  }

  const topRows = analysis?.rows?.slice(0, 12) || []
  const top = analysis?.top
  const rankingRows = topRows
    .map((row, index) => ({
      rankLabel: `${index + 1}. ${shortLabel(row.label)}`,
      fullLabel: row.label,
      score: Number(row.score || 0),
      response: Math.round(row.responseMs || 0),
      db: Math.round(row.dbMs || 0),
      wait: Math.round(row.waitMs || 0),
      component: row.component,
      kind: row.kind,
    }))
    .sort((a, b) => b.score - a.score)

  const parsedOk = analysis?.parseStatus?.filter((item) => item.ok).length || 0

  return (
    <section className="evidenceToolShell refinedTool">
      <header className="evidenceHero compactEvidenceHero">
        <div>
          <span>ST03N Analysis</span>
          <h1>Workload impact.</h1>
          <p>Validate response, database, wait, and workload evidence before deciding the RCA direction.</p>
        </div>
        <label className="evidenceUpload"><input type="file" multiple accept=".zip,.xlsx,.xls,.csv" onChange={(event) => onFiles(event.target.files)} />{busy ? 'Parsing…' : 'Upload ST03N Pack'}</label>
      </header>

      <SessionBanner session={session} />
      <div className="toolActionRow"><EvidenceToolbar analysis={analysis} cacheKey={CACHE_KEY} reportText={buildReportText(analysis)} filenamePrefix="sap-st03n-impact-v2" /></div>

      <section className="decisionBoard">
        <DecisionCard label="Impact Verdict" value={analysis?.verdict || 'Pending'} hint={analysis ? 'Workload impact decision' : status} tone={analysis?.verdict === 'Detected' ? 'good' : ''} />
        <DecisionCard label="Dominant Component" value={analysis?.dominant || 'Unknown'} hint="Response / DB / wait direction" tone="blue" />
        <DecisionCard label="Confidence" value={`${analysis?.confidence || 0}%`} hint={analysis?.correlation || 'Pending upload'} />
        <DecisionCard label="Completeness" value={`${analysis?.completeness || 0}%`} hint={`${parsedOk}/${REQUIRED_ST03N.length} required evidence groups parsed`} />
      </section>

      {top ? (
        <section className="rcaPrimaryFinding">
          <div>
            <span className="findingKicker">Top finding</span>
            <h2>{top.label}</h2>
            <p>{analysis?.nextAction || analysis?.correlation || 'Validate this workload object against the incident window.'}</p>
          </div>
          <div className="findingMetrics">
            <span>Score<b>{top.score}/100</b></span>
            <span>Response<b>{fmt(top.responseMs, 0)} ms</b></span>
            <span>DB share<b>{fmt(top.dbShare)}%</b></span>
          </div>
        </section>
      ) : null}

      <WorkspaceTabs tabs={VIEW_TABS} active={activeView} onChange={setActiveView} label="ST03N analysis views" />

      {activeView === 'overview' && (
        analysis ? (
          <div className="evidenceGrid">
            <section className="evidencePanel">
              <h2>Interpretation</h2>
              <p><b>{top?.label || analysis.dominant}</b> is the strongest parsed workload signal. The current pattern is <b>{analysis.dominant}</b>.</p>
              <div className="confidenceRows"><span>Correlation<b>{analysis.confidence}%</b></span><span>Coverage<b>{analysis.completeness}%</b></span><span>Rows<b>{analysis.rows?.length || 0}</b></span></div>
            </section>
            <section className="evidencePanel">
              <h2>Next validation</h2>
              <p>{analysis.nextAction || 'Correlate the highest workload offender with the incident time window and supporting log evidence.'}</p>
              <div className="evidenceList compact"><div><b>Dominant component</b><span>{analysis.dominant}</span></div><div><b>Correlation</b><span>{analysis.correlation || 'Not available'}</span></div></div>
            </section>
          </div>
        ) : (
          <EmptyState title="Start with the ST03N evidence pack"><p>Upload the five ST03N exports or a ZIP containing them. The workspace will surface the decision and strongest offender first.</p></EmptyState>
        )
      )}

      {activeView === 'workload' && (
        analysis ? (
          <section className="evidencePanel chartPanel rcaReadableChartPanel">
            <div className="chartTitleBlock"><h2>Top ST03N problem ranking</h2><p>Highest score first. Hover a bar for response, DB, wait, and component context.</p></div>
            <ResponsiveContainer width="100%" height={Math.max(340, rankingRows.length * 42)}>
              <BarChart data={rankingRows} layout="vertical" margin={{ top: 8, right: 58, bottom: 12, left: 170 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="rankLabel" width={170} axisLine={false} tickLine={false} />
                <Tooltip content={<St03nTooltip />} />
                <Legend formatter={(value) => value === 'score' ? 'Problem Score' : value} />
                <Bar dataKey="score" name="Problem Score" radius={[0, 7, 7, 0]} barSize={22}><LabelList dataKey="score" position="right" formatter={(value) => `${value}/100`} /></Bar>
              </BarChart>
            </ResponsiveContainer>
          </section>
        ) : <EmptyState title="No workload ranking yet"><p>Upload ST03N evidence first.</p></EmptyState>
      )}

      {activeView === 'components' && (
        analysis ? (
          <div className="evidenceGrid wide">
            <section className="evidencePanel"><h2>Component mix</h2><ResponsiveContainer width="100%" height={260}><PieChart><Pie data={analysis.componentRows || []} dataKey="value" nameKey="name" outerRadius={90} label>{(analysis.componentRows || []).map((_, index) => <Cell key={index} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></section>
            <section className="evidencePanel"><h2>Top objects</h2><div className="evidenceList compact">{topRows.slice(0, 8).map((row) => <div key={`${row.kind}-${row.fileName}-${row.label}`}><b>{row.label}</b><span>{row.component} · score {row.score}/100</span><small>Response {fmt(row.responseMs, 0)}ms · DB {fmt(row.dbMs, 0)}ms · Wait {fmt(row.waitMs, 0)}ms</small></div>)}</div></section>
          </div>
        ) : <EmptyState title="No component analysis yet"><p>Upload ST03N evidence first.</p></EmptyState>
      )}

      {activeView === 'evidence' && (
        <>
          <div className="evidenceGrid">
            <section className="evidencePanel"><h2>Evidence coverage</h2><div className="statusList">{REQUIRED_ST03N.map((required) => { const parsed = analysis?.parseStatus?.filter((item) => item.key === required.key) || []; const hasFile = detected[required.key]?.length || parsed.some((item) => item.ok); return <div key={required.key} className={hasFile ? 'ok' : 'missing'}><b>{required.label}</b><span>{detected[required.key]?.[0]?.name || parsed[0]?.message || 'missing'}</span></div> })}</div></section>
            <UploadedFilesPanel files={files} />
          </div>
          <EvidenceServerPanel serverInfo={serverInfo} />
          <AnalysisDisclosure label="Case" title={caseLink.caseId || 'Not linked'} meta="Explicit save · shared RCA correlation">
            <CaseLinkPanel title="Case & correlation" description="Link this ST03N result to the same RCA case used by Log Analysis so Case History can correlate both sources." caseId={caseLink.caseId} caseTitle={caseLink.caseTitle} recentCases={caseLink.recentCases} savingCase={caseLink.savingCase} saveStatus={caseLink.saveStatus} onCaseIdChange={caseLink.setCaseId} onCaseTitleChange={caseLink.setCaseTitle} onCreateCase={() => caseLink.createLinkedCase(analysis)} onSaveCurrent={() => caseLink.persistAnalysis(analysis, files)} hasAnalysis={Boolean(analysis)} saveLabel="Save ST03N analysis" titlePlaceholder="Contoh: ST03N response time RCA" />
          </AnalysisDisclosure>
        </>
      )}

      <section className="caseStatusStrip" aria-label="Current analysis case">
        <div><span>Analysis case</span><strong>{caseLink.caseId || 'Not linked'}</strong><small>{caseLink.caseId ? 'Ready for cross-tool correlation' : 'Link a case when the finding is ready'}</small></div>
        <div className="caseStatusActions"><button type="button" onClick={() => setActiveView('evidence')}>Manage case</button><a href="#/cases">History</a></div>
      </section>
    </section>
  )
}
