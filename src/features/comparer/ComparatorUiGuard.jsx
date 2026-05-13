import React from 'react'
import './ComparatorDirectPdfPrep.css'
import { parseWpScoutDirectUploadFiles } from './wpScoutDirectUploadParser.js'
import { clearWpScoutParsedEvidence } from '../pdf/wpScoutParsedEvidenceStore.js'

const DIRECT_UPLOAD_CACHE_KEY = 'sap_rca_wpscout_direct_upload_payload_v1'
const DIRECT_UPLOAD_BODY_CLASS = 'hasWpScoutDirectUpload'

function formatCount(value) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed.toLocaleString('en-US') : '0'
}

function formatPercent(value) {
  const parsed = Number(value || 0)
  if (!Number.isFinite(parsed) || parsed <= 0) return '0%'
  return `${parsed.toFixed(parsed >= 10 ? 0 : 1)}%`
}

function formatGb(value) {
  const parsed = Number(value || 0)
  if (!Number.isFinite(parsed) || parsed <= 0) return '0 GB'
  return `${parsed.toFixed(parsed >= 10 ? 1 : 2)} GB`
}

function formatSwap(value) {
  const parsed = Number(value || 0)
  if (!Number.isFinite(parsed) || parsed <= 0) return '0 p/s'
  return `${parsed.toFixed(parsed >= 10 ? 0 : 1)} p/s`
}

function buildCompactSummary(result) {
  if (!result) return ''
  const summary = result.summary || {}
  return [
    `${formatCount(result.rows?.length)} rows`,
    `${formatCount(summary.crit)} critical`,
    `${formatCount(summary.warn)} warning`,
    `${formatCount(summary.hosts)} hosts`,
    `Max RSS ${formatGb(summary.maxRss)}`,
    `CPU ${formatPercent(summary.peakCpu)}`,
    `Mem ${formatPercent(summary.peakMem)}`,
    `Swap ${formatSwap(summary.peakSwap)}`,
  ].join(' • ')
}

function markDirectUploadRuntime(active) {
  if (typeof document === 'undefined') return
  document.body.classList.toggle(DIRECT_UPLOAD_BODY_CLASS, Boolean(active))
}

function cacheDirectUploadResult(result) {
  if (typeof window === 'undefined' || !result) return

  const payload = {
    version: 1,
    savedAt: new Date().toISOString(),
    rows: result.rows || [],
    resourceSamples: result.resourceSamples || [],
    summary: result.summary || {},
    files: result.files || [],
    sourceFiles: result.sourceFiles || [],
  }

  window.__SAP_RCA_WP_SCOUT_DIRECT_UPLOAD__ = payload
  markDirectUploadRuntime(payload.rows.length > 0)

  try {
    window.sessionStorage?.setItem(DIRECT_UPLOAD_CACHE_KEY, JSON.stringify(payload))
  } catch (storageError) {
    console.warn('[SAP RCA PDF] Direct upload cache skipped', storageError)
  }
}

function clearDirectUploadCache() {
  if (typeof window === 'undefined') return
  window.__SAP_RCA_WP_SCOUT_DIRECT_UPLOAD__ = null
  markDirectUploadRuntime(false)
  try {
    window.sessionStorage?.removeItem(DIRECT_UPLOAD_CACHE_KEY)
  } catch (storageError) {
    console.warn('[SAP RCA PDF] Direct upload cache clear skipped', storageError)
  }
}

function readCachedDirectUpload() {
  if (typeof window === 'undefined') return null

  if (window.__SAP_RCA_WP_SCOUT_DIRECT_UPLOAD__?.rows?.length) {
    return window.__SAP_RCA_WP_SCOUT_DIRECT_UPLOAD__
  }

  try {
    const cached = window.sessionStorage?.getItem(DIRECT_UPLOAD_CACHE_KEY)
    return cached ? JSON.parse(cached) : null
  } catch (storageError) {
    console.warn('[SAP RCA PDF] Direct upload cache restore skipped', storageError)
    return null
  }
}

export default function ComparatorUiGuard() {
  const inputRef = React.useRef(null)
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('')
  const [error, setError] = React.useState(false)
  const [directResult, setDirectResult] = React.useState(null)

  React.useEffect(() => {
    import('../../tools/ToolComparer.clean.css')
    const cached = readCachedDirectUpload()
    if (cached?.rows?.length) {
      setDirectResult(cached)
      setStatus(`Ready for PDF export • ${cached.rows.length} evidence row(s) restored from direct upload cache.`)
      markDirectUploadRuntime(true)
    }

    return () => markDirectUploadRuntime(false)
  }, [])

  async function handleFiles(event) {
    const files = Array.from(event?.target?.files || [])
    if (!files.length) return

    setBusy(true)
    setError(false)
    setStatus('Preparing WP-SCOUT evidence for enterprise PDF export...')

    try {
      const result = await parseWpScoutDirectUploadFiles(files)
      const sourceCount = result?.files?.length || 0
      const rowCount = result?.rows?.length || 0

      cacheDirectUploadResult(result)
      setDirectResult(result)
      setStatus(`Ready for PDF export • ${rowCount} evidence row(s) parsed from ${sourceCount} extracted file(s).`)

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sap-rca:wpscout-direct-upload', { detail: result }))
      }

      console.info('[SAP RCA PDF] Direct upload prep ready', {
        rows: rowCount,
        files: result?.sourceFiles || [],
        resourceSamples: result?.resourceSamples?.length || 0,
        summary: result?.summary || {},
      })
    } catch (uploadError) {
      console.error('[SAP RCA PDF] Direct upload prep failed', uploadError)
      setDirectResult(null)
      setError(true)
      setStatus(uploadError?.message || 'Unable to parse ZIP/TXT upload.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function clearPreparedEvidence() {
    clearWpScoutParsedEvidence()
    clearDirectUploadCache()
    setDirectResult(null)
    setError(false)
    setStatus('Prepared evidence cleared. Comparer fallback view remains available.')
  }

  const compactSummary = buildCompactSummary(directResult)

  return (
    <div className={`cmpDirectPdfPrep ${directResult ? 'isCompactReady' : ''}`}>
      <div className="cmpDirectPdfPrepInner">
        <div className="cmpDirectPdfPrepText">
          <strong>WP-SCOUT ZIP/TXT Upload</strong>
          <span>
            Upload once here. The same evidence is prepared for PDF export and the RCA dashboard.
          </span>
        </div>

        <div className="cmpDirectPdfPrepActions">
          <input
            ref={inputRef}
            type="file"
            accept=".zip,.txt,.log,.out,.trace"
            multiple
            hidden
            onChange={handleFiles}
          />

          <button
            type="button"
            className="cmpDirectPdfPrepButton"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? 'Preparing...' : directResult ? 'Replace ZIP/TXT' : 'Upload ZIP/TXT'}
          </button>

          <button
            type="button"
            className="cmpDirectPdfPrepClear"
            onClick={clearPreparedEvidence}
          >
            Clear
          </button>
        </div>
      </div>

      {status ? (
        <div className={`cmpDirectPdfPrepStatus ${error ? 'isError' : ''}`}>
          {status}
        </div>
      ) : null}

      {compactSummary ? (
        <div className="cmpDirectPdfPrepCompactSummary" aria-label="Direct upload parsed summary">
          {compactSummary}
        </div>
      ) : null}

      <div className="cmpDirectPdfPrepHint">
        Detailed cards and charts stay below. This upload panel stays compact on mobile.
      </div>
    </div>
  )
}
