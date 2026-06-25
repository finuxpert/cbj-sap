import React from 'react'
import { copyText, downloadJson, fileSizeLabel } from './evidence-utils.js'
import './EvidenceDecisionKit.css'

function useSt03nCompactGrid() {
  React.useEffect(() => {
    if (typeof document === 'undefined') return
    if (document.getElementById('st03n-compact-runtime')) return
    const style = document.createElement('style')
    style.id = 'st03n-compact-runtime'
    style.textContent = `.st03nImpactShell .st03nDashboardBoard{grid-template-columns:repeat(12,minmax(0,1fr))!important}.st03nImpactShell .st03nDashboardBoard>div:nth-child(1){grid-column:span 3!important}.st03nImpactShell .st03nDashboardBoard>div:nth-child(2){grid-column:span 6!important}.st03nImpactShell .st03nDashboardBoard>div:nth-child(3){grid-column:span 3!important}.st03nImpactShell .st03nDashboardBoard>div:nth-child(5){grid-column:span 12!important}.st03nImpactShell .st03nDashboardBoard>div:nth-child(4),.st03nImpactShell .st03nDashboardBoard>div:nth-child(n+6),.st03nImpactShell .st03nFooterGrid{display:none!important}.st03nImpactShell .st03nDashboardBoard>div:nth-child(2) .evidenceList{display:none!important}.st03nImpactShell .visual>div[style*='height: 360'],.st03nImpactShell .visual>div[style*='height: 330'],.st03nImpactShell .visual>div[style*='height: 300']{height:230px!important}`
    document.head.appendChild(style)
  }, [])
}

export function DecisionCard({ label, value, hint, tone = '' }) {
  return <div className={`decisionCard ${tone}`}><span>{label}</span><b>{value}</b><small>{hint}</small></div>
}

export function SessionBanner({ session }) {
  if (!session) return null
  return <section className="sessionBanner"><b>Latest RCA session</b><span>{session.sid} • {session.host} • {session.window?.start} - {session.window?.end}</span><small>{session.summary}</small></section>
}

async function exportEvidencePdf(filenamePrefix = 'sap-evidence-analysis') {
  const shell = document.querySelector('.evidenceToolShell') || document.querySelector('main') || document.body
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
}

export function EvidenceToolbar({ analysis, cacheKey, reportText, filenamePrefix = 'sap-evidence-analysis' }) {
  useSt03nCompactGrid()
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
      await exportEvidencePdf(filenamePrefix)
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
  return <div className="evidenceToolbar"><button type="button" disabled={!canExport} onClick={copy}>{copied ? 'Copied' : 'Copy Summary'}</button><button type="button" disabled={!canExport} onClick={() => downloadJson(`${filenamePrefix}.json`, analysis)}>Export JSON</button><button type="button" disabled={!canExport || exportingPdf} onClick={exportPdf}>{exportingPdf ? 'Exporting PDF…' : 'Export PDF'}</button><button type="button" onClick={clear}>Clear Cache</button></div>
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
