import React from 'react'
import { uploadEvidence } from '../../evidence-api-client.js'

const TOOL_LABEL = {
  comparer: 'RCA Comparator / WP-SCOUT',
  analyzer: 'ST03N Analyzer',
  logs: 'Log Triage',
}

function normalizeFiles(fileList) {
  return Array.from(fileList || []).filter(Boolean)
}

export default function EvidenceUploader({
  tool = 'unknown',
  sid = '',
  title = '',
  note = '',
  tags = [],
  accept,
  multiple = true,
  onFiles,
  onUploaded,
  onError,
}) {
  const inputRef = React.useRef(null)
  const [dragOver, setDragOver] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('')

  const handleFiles = async (fileList) => {
    const files = normalizeFiles(fileList)
    if (!files.length || busy) return

    setBusy(true)
    setStatus(`Preparing ${files.length} file(s)…`)

    try {
      onFiles?.(files)

      const uploaded = []
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i]
        setStatus(`Saving evidence ${i + 1}/${files.length}: ${file.name}`)
        const result = await uploadEvidence(file, {
          tool,
          sid,
          title: title || file.name,
          note,
          tags,
        })
        uploaded.push({ file, result })
      }

      setStatus(`Evidence saved: ${uploaded.length} file(s)`)
      onUploaded?.(uploaded)
    } catch (err) {
      console.error('[EvidenceUploader] upload failed:', err)
      const message = err?.message || String(err)
      setStatus(`Upload failed: ${message}`)
      onError?.(err)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div
      className={`evidenceUploader ${dragOver ? 'isDragOver' : ''} ${busy ? 'isBusy' : ''}`}
      onDragOver={(event) => {
        event.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragOver(false)
        handleFiles(event.dataTransfer.files)
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(event) => handleFiles(event.target.files)}
      />
      <div className="evidenceUploaderText">
        <strong>{TOOL_LABEL[tool] || 'SAP RCA Evidence'}</strong>
        <span>Drop files here or save them to server-side Evidence API.</span>
        {status ? <small>{status}</small> : null}
      </div>
      <button className="btn secondary" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? 'Saving…' : 'Upload Evidence'}
      </button>
    </div>
  )
}
