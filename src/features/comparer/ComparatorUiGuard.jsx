import React from 'react'
import './ComparatorDirectPdfPrep.css'
import { parseWpScoutDirectUploadFiles } from './wpScoutDirectUploadParser.js'
import { clearWpScoutParsedEvidence } from '../pdf/wpScoutParsedEvidenceStore.js'

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

function buildDirectKpis(result) {
  if (!result) return []
  const summary = result.summary || {}
  return [
    { label: 'Rows', value: formatCount(result.rows?.length) },
    { label: 'Files', value: formatCount(result.files?.length) },
    { label: 'Critical', value: formatCount(summary.crit) },
    { label: 'Warning', value: formatCount(summary.warn) },
    { label: 'Hosts', value: formatCount(summary.hosts) },
    { label: 'Max RSS', value: formatGb(summary.maxRss) },
    { label: 'Peak CPU', value: formatPercent(summary.peakCpu) },
    { label: 'Peak Memory', value: formatPercent(summary.peakMem) },
    { label: 'Peak Swap', value: formatSwap(summary.peakSwap) },
  ]
}

function latestSamples(samples = []) {
  return [...samples]
    .filter(Boolean)
    .slice(-6)
    .reverse()
}

export default function ComparatorUiGuard() {
  const inputRef = React.useRef(null)
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('')
  const [error, setError] = React.useState(false)
  const [directResult, setDirectResult] = React.useState(null)

  React.useEffect(() => {
    import('../../tools/ToolComparer.clean.css')
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
    setDirectResult(null)
    setError(false)
    setStatus('Prepared evidence cleared. Comparer fallback view remains available.')
  }

  const kpis = buildDirectKpis(directResult)
  const samples = latestSamples(directResult?.resourceSamples)

  return (
    <div className="cmpDirectPdfPrep">
      <div className="cmpDirectPdfPrepInner">
        <div className="cmpDirectPdfPrepText">
          <strong>Direct ZIP/TXT PDF Prep</strong>
          <span>
            Upload WP-SCOUT ZIP/TXT evidence directly from mobile, then use the existing Export PDF action.
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
            {busy ? 'Preparing...' : 'Upload ZIP/TXT'}
          </button>

          <button
            type="button"
            className="cmpDirectPdfPrepClear"
            onClick={clearPreparedEvidence}
          >
            Clear Prepared Data
          </button>
        </div>
      </div>

      {status ? (
        <div className={`cmpDirectPdfPrepStatus ${error ? 'isError' : ''}`}>
          {status}
        </div>
      ) : null}

      {directResult ? (
        <div className="cmpDirectPdfPrepSummary" aria-label="Direct upload parsed summary">
          <div className="cmpDirectPdfPrepKpis">
            {kpis.map((item) => (
              <div className="cmpDirectPdfPrepKpi" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>

          {samples.length ? (
            <div className="cmpDirectPdfPrepTrend">
              <div className="cmpDirectPdfPrepTrendTitle">Recent resource samples</div>
              <div className="cmpDirectPdfPrepTrendRows">
                {samples.map((sample, index) => (
                  <div className="cmpDirectPdfPrepTrendRow" key={`${sample.time || 'sample'}-${index}`}>
                    <span>{sample.time || 'snapshot'}</span>
                    <strong>CPU {formatPercent(sample.cpu)}</strong>
                    <strong>Mem {formatPercent(sample.mem)}</strong>
                    <strong>Swap {formatSwap(sample.swapSi)}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="cmpDirectPdfPrepHint">
        Parsed evidence is injected into the enterprise PDF V5 data source and still falls back safely to visible comparer data.
      </div>
    </div>
  )
}
