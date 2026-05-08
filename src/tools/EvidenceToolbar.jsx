import React from 'react'
import { copyText, downloadJson } from './evidence-utils.js'
import './EvidenceDecisionKit.css'

export default function EvidenceToolbar({ analysis, cacheKey, reportText, filenamePrefix = 'sap-evidence-analysis' }) {
  const [copied, setCopied] = React.useState(false)
  const canExport = Boolean(analysis)

  const copy = async () => {
    await copyText(reportText || JSON.stringify(analysis || {}, null, 2))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const clear = () => {
    if (cacheKey) localStorage.removeItem(cacheKey)
    window.location.reload()
  }

  return (
    <div className="evidenceToolbar">
      <button type="button" disabled={!canExport} onClick={copy}>{copied ? 'Copied' : 'Copy Summary'}</button>
      <button type="button" disabled={!canExport} onClick={() => downloadJson(`${filenamePrefix}.json`, analysis)}>Export JSON</button>
      <button type="button" onClick={clear}>Clear Cache</button>
    </div>
  )
}
