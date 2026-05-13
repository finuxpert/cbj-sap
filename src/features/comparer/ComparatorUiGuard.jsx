import React from 'react'
import './ComparatorDirectPdfPrep.css'
import { parseWpScoutDirectUploadFiles } from './wpScoutDirectUploadParser.js'
import { clearWpScoutParsedEvidence } from '../pdf/wpScoutParsedEvidenceStore.js'

export default function ComparatorUiGuard() {
  const inputRef = React.useRef(null)
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('')
  const [error, setError] = React.useState(false)

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

      setStatus(`Ready for PDF export • ${rowCount} evidence row(s) parsed from ${sourceCount} extracted file(s).`)

      console.info('[SAP RCA PDF] Direct upload prep ready', {
        rows: rowCount,
        files: result?.sourceFiles || [],
      })
    } catch (uploadError) {
      console.error('[SAP RCA PDF] Direct upload prep failed', uploadError)
      setError(true)
      setStatus(uploadError?.message || 'Unable to parse ZIP/TXT upload.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function clearPreparedEvidence() {
    clearWpScoutParsedEvidence()
    setError(false)
    setStatus('Prepared evidence cleared. Comparer fallback view remains available.')
  }

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

      <div className="cmpDirectPdfPrepHint">
        Parsed evidence is injected into the enterprise PDF V5 data source and still falls back safely to visible comparer data.
      </div>
    </div>
  )
}
