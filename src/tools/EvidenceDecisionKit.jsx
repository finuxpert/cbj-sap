import React from 'react'
import { copyText, downloadJson, fileSizeLabel } from './evidence-utils.js'
import './EvidenceDecisionKit.css'

const ST03N_VIEW_STYLE_ID = 'st03n-view-mode-runtime'

function ensureSt03nViewStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(ST03N_VIEW_STYLE_ID)) return

  const style = document.createElement('style')
  style.id = ST03N_VIEW_STYLE_ID
  style.textContent = `
    .st03nViewSwitch{display:inline-flex;gap:4px;padding:4px;border:1px solid rgba(148,163,184,.18);border-radius:999px;background:rgba(15,23,42,.38)}
    .st03nViewSwitch button{border-radius:999px!important;min-height:30px!important;padding:0 12px!important}
    .st03nViewSwitch button.active{background:linear-gradient(135deg,#7ce38b,#25f3d0)!important;color:#07100b!important;border-color:transparent!important}
    .st03nImpactShell:not(.st03nReportMode) .st03nDashboardBoard{grid-template-columns:repeat(12,minmax(0,1fr))!important}
    .st03nImpactShell:not(.st03nReportMode) .st03nDashboardBoard>div{display:block!important}
    .st03nImpactShell:not(.st03nReportMode) .st03nDashboardBoard>div:nth-child(1){grid-column:span 12!important}
    .st03nImpactShell:not(.st03nReportMode) .st03nDashboardBoard>div:nth-child(2){grid-column:span 8!important}
    .st03nImpactShell:not(.st03nReportMode) .st03nDashboardBoard>div:nth-child(3){grid-column:span 4!important}
    .st03nImpactShell:not(.st03nReportMode) .st03nDashboardBoard>div:nth-child(n+4){grid-column:span 12!important}
    .st03nImpactShell:not(.st03nReportMode) .st03nDashboardBoard>div:nth-child(7),
    .st03nImpactShell:not(.st03nReportMode) .st03nDashboardBoard>div:nth-child(8),
    .st03nImpactShell:not(.st03nReportMode) .st03nDashboardBoard>div:nth-child(9){grid-column:span 4!important}
    .st03nImpactShell:not(.st03nReportMode) .st03nFooterGrid{display:grid!important}
    .st03nImpactShell:not(.st03nReportMode) .st03nDashboardBoard>div:nth-child(2) .evidenceList{display:grid!important}
    .st03nImpactShell:not(.st03nReportMode) .visual>div[style*='height: 360']{height:360px!important}
    .st03nImpactShell:not(.st03nReportMode) .visual>div[style*='height: 340']{height:340px!important}
    .st03nImpactShell:not(.st03nReportMode) .visual>div[style*='height: 330']{height:330px!important}
    .st03nImpactShell:not(.st03nReportMode) .visual>div[style*='height: 300']{height:300px!important}
    .st03nReportMode{padding:12px 14px!important}
    .st03nReportMode .sessionBanner,
    .st03nReportMode .st03nFooterGrid,
    .st03nReportMode .st03nDashboardBoard>div:nth-child(4),
    .st03nReportMode .st03nDashboardBoard>div:nth-child(n+6){display:none!important}
    .st03nReportMode .evidenceHero{grid-template-columns:minmax(0,1fr)!important;padding:12px 16px!important;margin-bottom:8px!important}
    .st03nReportMode .evidenceUpload{display:none!important}
    .st03nReportMode .heroCopyBlock>span{font-size:10px!important}
    .st03nReportMode .heroCopyBlock h1{font-size:0!important;margin:4px 0!important;line-height:1!important}
    .st03nReportMode .heroCopyBlock h1::after{content:'ST03N RCA Report';font-size:26px;letter-spacing:-.04em}
    .st03nReportMode .heroCopyBlock p{font-size:12px!important;max-width:980px!important}
    .st03nReportMode .decisionBoard{grid-template-columns:1.2fr 1.2fr .8fr .8fr!important;gap:8px!important;margin-bottom:8px!important}
    .st03nReportMode .decisionCard{min-height:72px!important;padding:9px 11px!important;border-radius:13px!important}
    .st03nReportMode .decisionCard span{font-size:9px!important}
    .st03nReportMode .decisionCard b{font-size:18px!important}
    .st03nReportMode .decisionCard small{font-size:10px!important;line-height:1.25!important}
    .st03nReportMode .st03nSummaryGrid{grid-template-columns:minmax(0,1fr)!important;margin-bottom:8px!important}
    .st03nReportMode .parsePanel{padding:9px 11px!important}
    .st03nReportMode .parsePanel .panelTitleRow{display:none!important}
    .st03nReportMode .parsePanel .statusList{grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:6px!important}
    .st03nReportMode .parsePanel .statusList div{min-height:34px!important;padding:6px 7px!important;border-radius:999px!important;display:flex!important;align-items:center!important;gap:6px!important;overflow:hidden!important}
    .st03nReportMode .parsePanel .statusList b{font-size:10px!important;white-space:nowrap!important}
    .st03nReportMode .parsePanel .statusList span{display:none!important}
    .st03nReportMode .interpretationPanel{padding:10px 12px!important}
    .st03nReportMode .interpretationPanel p{font-size:12px!important;margin:0!important}
    .st03nReportMode .interpretationPanel .confidenceRows{margin-top:8px!important}
    .st03nReportMode .st03nKpiStrip{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:8px!important;margin-bottom:8px!important}
    .st03nReportMode .st03nKpiCard{min-height:64px!important;padding:9px 10px!important;border-radius:13px!important}
    .st03nReportMode .st03nKpiCard span{font-size:9px!important}
    .st03nReportMode .st03nKpiCard b{font-size:16px!important}
    .st03nReportMode .st03nKpiCard small{font-size:10px!important}
    .st03nReportMode .st03nDashboardBoard{grid-template-columns:repeat(12,minmax(0,1fr))!important;gap:8px!important;margin-top:8px!important}
    .st03nReportMode .st03nDashboardBoard>div:nth-child(1){grid-column:span 3!important}
    .st03nReportMode .st03nDashboardBoard>div:nth-child(2){grid-column:span 6!important}
    .st03nReportMode .st03nDashboardBoard>div:nth-child(3){grid-column:span 3!important}
    .st03nReportMode .st03nDashboardBoard>div:nth-child(5){grid-column:span 12!important}
    .st03nReportMode .st03nDashboardBoard>div:nth-child(2) .evidenceList{display:none!important}
    .st03nReportMode .evidencePanel{padding:10px 11px!important;border-radius:14px!important}
    .st03nReportMode .panelTitleRow h2{font-size:10px!important;margin-bottom:6px!important}
    .st03nReportMode .panelTitleRow span{font-size:9px!important}
    .st03nReportMode .visual>div[style*='height: 360'],
    .st03nReportMode .visual>div[style*='height: 330'],
    .st03nReportMode .visual>div[style*='height: 300']{height:215px!important}
    .st03nReportMode .st03nDashboardBoard>div:nth-child(5) .panelTitleRow span{font-size:0!important}
    .st03nReportMode .st03nDashboardBoard>div:nth-child(5) .panelTitleRow span::after{content:'Top 5 offenders';font-size:9px}
    .st03nReportMode .st03nDashboardBoard>div:nth-child(5) input,
    .st03nReportMode .st03nDashboardBoard>div:nth-child(5) select,
    .st03nReportMode .st03nDashboardBoard>div:nth-child(5) .panelTitleRow+div,
    .st03nReportMode .st03nDashboardBoard>div:nth-child(5) .panelTitleRow+div+div{display:none!important}
    .st03nReportMode .st03nDashboardBoard>div:nth-child(5) table{min-width:760px!important}
    .st03nReportMode .st03nDashboardBoard>div:nth-child(5) tbody tr:nth-child(n+6){display:none!important}
    .st03nReportMode .st03nDashboardBoard>div:nth-child(5) th,
    .st03nReportMode .st03nDashboardBoard>div:nth-child(5) td{padding:7px 8px!important;font-size:10px!important}
    @media(max-width:1120px){.st03nReportMode .decisionBoard,.st03nReportMode .st03nKpiStrip,.st03nReportMode .parsePanel .statusList{grid-template-columns:1fr!important}.st03nReportMode .st03nDashboardBoard>div{grid-column:span 12!important}}
  `
  document.head.appendChild(style)
}

function useSt03nViewMode(filenamePrefix) {
  const isSt03n = String(filenamePrefix || '').includes('st03n')
  const [viewMode, setViewMode] = React.useState('analyst')

  React.useEffect(() => {
    if (!isSt03n || typeof document === 'undefined') return undefined
    ensureSt03nViewStyles()
    const shell = document.querySelector('.st03nImpactShell')
    if (!shell) return undefined
    shell.classList.toggle('st03nReportMode', viewMode === 'report')
    return () => shell.classList.remove('st03nReportMode')
  }, [isSt03n, viewMode])

  return isSt03n ? [viewMode, setViewMode] : [null, () => {}]
}

export function DecisionCard({ label, value, hint, tone = '' }) {
  return <div className={`decisionCard ${tone}`}><span>{label}</span><b>{value}</b><small>{hint}</small></div>
}

export function SessionBanner({ session }) {
  if (!session) return null
  return <section className="sessionBanner"><b>Latest RCA session</b><span>{session.sid} • {session.host} • {session.window?.start} - {session.window?.end}</span><small>{session.summary}</small></section>
}

async function exportEvidencePdf(filenamePrefix = 'sap-evidence-analysis', options = {}) {
  const forceReport = Boolean(options.forceReport)
  const shell = document.querySelector('.evidenceToolShell') || document.querySelector('main') || document.body
  const shouldForceReport = forceReport && shell?.classList?.contains('st03nImpactShell')
  const wasReportMode = shouldForceReport ? shell.classList.contains('st03nReportMode') : false

  if (shouldForceReport) {
    ensureSt03nViewStyles()
    shell.classList.add('st03nReportMode')
  }

  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  const originalScrollY = window.scrollY
  window.scrollTo(0, 0)

  await new Promise((resolve) => window.setTimeout(resolve, 350))

  const canvas = await html2canvas(shell, {
    backgroundColor: '#020617',
    scale: Math.min(2, window.devicePixelRatio || 1.5),
    useCORS: true,
    allowTaint: true,
    logging: false,
    windowWidth: Math.max(document.documentElement.scrollWidth, shell.scrollWidth, 1440),
    windowHeight: Math.max(document.documentElement.scrollHeight, shell.scrollHeight, 1200),
  })

  const pdf = new jsPDF('p', 'mm', 'a4')
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 8
  const printableWidth = pageWidth - margin * 2
  const printableHeight = pageHeight - margin * 2
  const imgWidthPx = canvas.width
  const pageHeightPx = Math.floor((printableHeight * imgWidthPx) / printableWidth)

  let renderedHeight = 0
  let page = 0

  while (renderedHeight < canvas.height) {
    const sliceHeight = Math.min(pageHeightPx, canvas.height - renderedHeight)
    const pageCanvas = document.createElement('canvas')
    pageCanvas.width = canvas.width
    pageCanvas.height = sliceHeight

    const ctx = pageCanvas.getContext('2d')
    ctx.fillStyle = '#020617'
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
    ctx.drawImage(canvas, 0, renderedHeight, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)

    const imgData = pageCanvas.toDataURL('image/jpeg', 0.92)
    const imgHeightMm = (sliceHeight * printableWidth) / imgWidthPx

    if (page > 0) pdf.addPage()
    pdf.addImage(imgData, 'JPEG', margin, margin, printableWidth, imgHeightMm)
    pdf.setFontSize(8)
    pdf.setTextColor(120, 130, 150)
    pdf.text(`SAP RCA Evidence Report • Page ${page + 1}`, margin, pageHeight - 3)

    renderedHeight += sliceHeight
    page += 1
  }

  pdf.save(`${filenamePrefix}-report.pdf`)
  window.scrollTo(0, originalScrollY)

  if (shouldForceReport && !wasReportMode) shell.classList.remove('st03nReportMode')
}

export function EvidenceToolbar({ analysis, cacheKey, reportText, filenamePrefix = 'sap-evidence-analysis' }) {
  const [viewMode, setViewMode] = useSt03nViewMode(filenamePrefix)
  const isSt03n = Boolean(viewMode)
  const [copied, setCopied] = React.useState(false)
  const [exportingPdf, setExportingPdf] = React.useState(false)
  const canExport = Boolean(analysis)
  const copy = async () => {
    await copyText(reportText || JSON.stringify(analysis || {}, null, 2))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }
  const exportPdf = async () => {
    if (!canExport || exportingPdf) return
    setExportingPdf(true)
    try {
      await exportEvidencePdf(filenamePrefix, { forceReport: isSt03n })
    } catch (error) {
      console.error('Failed to export evidence PDF', error)
      window.alert('Failed to export PDF. Please try again or reduce browser zoom to 90%.')
    } finally {
      setExportingPdf(false)
    }
  }
  const clear = () => {
    if (cacheKey) localStorage.removeItem(cacheKey)
    window.location.reload()
  }
  return (
    <div className="evidenceToolbar">
      {isSt03n ? (
        <div className="st03nViewSwitch" role="group" aria-label="ST03N view mode">
          <button type="button" className={viewMode === 'analyst' ? 'active' : ''} onClick={() => setViewMode('analyst')}>Analyst View</button>
          <button type="button" className={viewMode === 'report' ? 'active' : ''} onClick={() => setViewMode('report')}>Report View</button>
        </div>
      ) : null}
      <button type="button" disabled={!canExport} onClick={copy}>{copied ? 'Copied' : 'Copy Summary'}</button>
      <button type="button" disabled={!canExport} onClick={() => downloadJson(`${filenamePrefix}.json`, analysis)}>Export JSON</button>
      <button type="button" disabled={!canExport || exportingPdf} onClick={exportPdf}>{exportingPdf ? 'Exporting PDF…' : 'Export PDF'}</button>
      <button type="button" onClick={clear}>Clear Cache</button>
    </div>
  )
}

export function UploadedFilesPanel({ files = [] }) {
  return <section className="evidencePanel"><h2>Uploaded Files</h2>{files.length ? <div className="evidenceList compact">{files.slice(0, 18).map((file) => <div key={`${file.name}-${file.size}`}><b>{file.name}</b><span>{fileSizeLabel(file.size)}</span></div>)}</div> : <p>No upload in this page yet. Cached analysis may still be shown.</p>}</section>
}

export function EmptyState({ title = 'How to use this analyzer', children }) {
  return <section className="evidencePanel emptyState"><h2>{title}</h2>{children}</section>
}

export function EvidenceServerPanel({ serverInfo }) {
  const count = Array.isArray(serverInfo?.items) ? serverInfo.items.length : Array.isArray(serverInfo?.evidence) ? serverInfo.evidence.length : 0
  return <section className="evidencePanel"><h2>Evidence Server Context</h2><p>{serverInfo?.ok === false ? 'Evidence API list is not available from this page.' : 'Recent server evidence context loaded for reference.'}</p><div className="confidenceRows"><span>Recent Items<b>{count}</b></span><span>Source<b>/sap-api/evidence</b></span><span>Status<b>{serverInfo?.ok === false ? 'Partial' : 'Ready'}</b></span></div></section>
}
