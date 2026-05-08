import React from 'react'
import { archiveCase, closeCase, getMobileCase, updateCase } from '../../evidence-api-client.js'
import { exportCaseDetailPdf } from '../../features/cases/casePdfExport.js'

function formatDate(value) {
  if (!value) return '-'
  try {
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return String(value)
  }
}

function normalizeCase(payload) {
  return payload?.case || payload?.item || payload || null
}

function Stat({ label, value }) {
  return (
    <div className="caseDetailStat">
      <span>{label}</span>
      <strong>{value || '-'}</strong>
    </div>
  )
}

function TimelineList({ items = [] }) {
  if (!items.length) {
    return <div className="caseDetailEmptyLine">No timeline saved yet.</div>
  }

  return (
    <div className="caseDetailTimeline">
      {items.map((item, index) => (
        <article key={item.id || `${item.time || item.created_at || 'timeline'}-${index}`}>
          <span>{formatDate(item.time || item.created_at)}</span>
          <strong>{item.title || item.tool || 'RCA event'}</strong>
          <p>{item.description || item.summary || item.reason || '-'}</p>
        </article>
      ))}
    </div>
  )
}

function ParsedResults({ items = [] }) {
  if (!items.length) {
    return <div className="caseDetailEmptyLine">No parsed result saved yet.</div>
  }

  return (
    <div className="caseDetailResultList">
      {items.map((item, index) => (
        <article key={item.id || `${item.tool || 'result'}-${index}`}>
          <div>
            <span>{item.tool || 'tool'}</span>
            <b>{item.severity || 'INFO'}</b>
          </div>
          <strong>{item.top_anomaly || item.verdict || 'Parsed result'}</strong>
          <p>{item.summary || item.top_suspect || '-'}</p>
        </article>
      ))}
    </div>
  )
}

function EvidenceList({ items = [] }) {
  if (!items.length) {
    return <div className="caseDetailEmptyLine">No linked evidence yet.</div>
  }

  return (
    <div className="caseDetailEvidenceList">
      {items.map((item, index) => (
        <a
          key={item.id || `${item.title || item.original_filename || 'evidence'}-${index}`}
          href={item.download_url || '#'}
          target="_blank"
          rel="noreferrer"
        >
          <strong>{item.title || item.original_filename || item.id || 'Evidence file'}</strong>
          <span>{item.tool || 'evidence'} · {formatDate(item.created_at)}</span>
        </a>
      ))}
    </div>
  )
}

function buildDraft(caseData) {
  return {
    title: caseData?.title || '',
    sid: caseData?.sid || '',
    environment: caseData?.environment || '',
    severity: caseData?.severity || 'INFO',
    status: caseData?.status || 'OPEN',
    summary: caseData?.summary || '',
    top_anomaly: caseData?.top_anomaly || '',
    top_suspect: caseData?.top_suspect || '',
  }
}

export default function CaseDetail({ caseId }) {
  const [caseData, setCaseData] = React.useState(null)
  const [draft, setDraft] = React.useState(buildDraft(null))
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [savingMode, setSavingMode] = React.useState('')
  const [exporting, setExporting] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const [error, setError] = React.useState('')

  const loadCase = React.useCallback(async () => {
    if (!caseId) return
    setLoading(true)
    setError('')
    try {
      const payload = await getMobileCase(caseId)
      if (payload?.ok === false) throw new Error(payload?.detail || payload?.raw || 'Failed to load case detail')
      const nextCase = normalizeCase(payload)
      setCaseData(nextCase)
      setDraft(buildDraft(nextCase))
    } catch (err) {
      setError(err?.message || 'Failed to load case detail')
      setCaseData(null)
    } finally {
      setLoading(false)
    }
  }, [caseId])

  React.useEffect(() => {
    loadCase()
  }, [loadCase])

  const exportPdf = React.useCallback(async () => {
    if (!caseData || exporting) return
    setExporting(true)
    try {
      await exportCaseDetailPdf(caseData)
    } catch (err) {
      console.error('[Case Detail PDF] failed:', err)
      window.print()
    } finally {
      setExporting(false)
    }
  }, [caseData, exporting])

  const patchCase = React.useCallback(async (mode, payload) => {
    if (!caseId) return
    setSaving(true)
    setSavingMode(mode)
    setError('')
    setNotice(mode === 'archive' ? 'Archiving case…' : mode === 'close' ? 'Closing case…' : 'Saving case changes…')
    try {
      let response
      if (mode === 'archive') response = await archiveCase(caseId)
      else if (mode === 'close') response = await closeCase(caseId)
      else response = await updateCase(caseId, payload)
      if (response?.ok === false) throw new Error(response?.detail || response?.raw || 'Failed to update case')
      setNotice(mode === 'archive' ? 'Case archived.' : mode === 'close' ? 'Case closed.' : 'Case changes saved.')
      await loadCase()
    } catch (err) {
      setError(err?.message || 'Failed to update case')
    } finally {
      setSaving(false)
      setSavingMode('')
    }
  }, [caseId, loadCase])

  const onFieldChange = React.useCallback((field, value) => {
    setDraft((current) => ({ ...current, [field]: value }))
  }, [])

  const onSubmit = React.useCallback((event) => {
    event.preventDefault()
    patchCase('save', {
      title: draft.title.trim() || caseData?.title || caseId,
      sid: draft.sid.trim(),
      environment: draft.environment.trim(),
      severity: draft.severity,
      status: draft.status,
      summary: draft.summary.trim(),
      top_anomaly: draft.top_anomaly.trim(),
      top_suspect: draft.top_suspect.trim(),
    })
  }, [caseData?.title, caseId, draft, patchCase])

  const onArchive = React.useCallback(() => {
    if (!window.confirm(`Archive case ${caseData?.title || caseData?.case_no || caseId}?`)) return
    patchCase('archive')
  }, [caseData?.case_no, caseData?.title, caseId, patchCase])

  const onClose = React.useCallback(() => {
    patchCase('close')
  }, [patchCase])

  const topProblem = caseData?.top_problem || {}
  const summary = caseData?.executive_summary || caseData?.summary || 'No management summary saved yet.'
  const latestParsed = caseData?.parsed_results?.[caseData?.parsed_results?.length ? caseData.parsed_results.length - 1 : 0]
  const toolLabel = caseData?.tool || latestParsed?.tool || '-'
  const statusValue = String(caseData?.status || draft.status || 'OPEN').toUpperCase()

  return (
    <section className="caseDetailPage container section">
      <div className="caseDetailBackRow">
        <a href="#/cases">← Back to Case History</a>
        <div className="caseDetailActions">
          <button className="btn" type="button" onClick={loadCase} disabled={loading || saving}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button className="btn primary" type="button" onClick={exportPdf} disabled={loading || exporting || !caseData}>
            {exporting ? 'Preparing PDF…' : 'Export PDF'}
          </button>
        </div>
      </div>

      {notice && !error && <div className="caseHistoryNotice">{notice}</div>}
      {error && <div className="caseHistoryNotice isError">{error}</div>}
      {!error && loading && <div className="caseHistoryNotice">Loading case detail from /sap-api/mobile/cases/{caseId}…</div>}

      {!loading && !error && caseData && (
        <>
          <div className="caseDetailHero">
            <div>
              <p className="sectionKicker">Management RCA Snapshot</p>
              <h1>{caseData.title || caseData.case_no || caseData.id}</h1>
              <p>{summary}</p>
            </div>
            <div className="caseDetailBadgeStack">
              <span>{caseData.severity || 'INFO'}</span>
              <strong>{statusValue}</strong>
            </div>
          </div>

          <div className="caseDetailStats">
            <Stat label="Case No" value={caseData.case_no || caseData.id} />
            <Stat label="Tool" value={toolLabel} />
            <Stat label="SID" value={caseData.sid} />
            <Stat label="Environment" value={caseData.environment} />
            <Stat label="Created" value={formatDate(caseData.created_at)} />
            <Stat label="Updated" value={formatDate(caseData.updated_at || caseData.created_at)} />
          </div>

          <div className="caseDetailMainGrid">
            <article className="caseDetailPanel caseDetailPanel--primary">
              <p className="sectionKicker">Top Problem</p>
              <h2>{topProblem.label || caseData.top_suspect || caseData.top_anomaly || 'Pending analysis'}</h2>
              <p>{topProblem.reason || caseData.top_anomaly || 'Upload and parse evidence to generate anomaly detail.'}</p>
            </article>

            <article className="caseDetailPanel">
              <p className="sectionKicker">Evidence / Report</p>
              <div className="caseDetailMiniCounts">
                <div><strong>{caseData.evidence?.length || caseData.evidence_count || 0}</strong><span>Evidence</span></div>
                <div><strong>{caseData.reports?.length || caseData.report_count || 0}</strong><span>Reports</span></div>
                <div><strong>{caseData.parsed_results?.length || 0}</strong><span>Parsed</span></div>
              </div>
            </article>
          </div>

          <article className="caseDetailPanel caseDetailFormPanel">
            <div className="caseDetailSectionHead">
              <div>
                <p className="sectionKicker">Edit Case</p>
                <span>Safe maintenance via PATCH /cases/{caseId}</span>
              </div>
              <div className="caseDetailActionRow">
                <button className="btn" type="button" onClick={onClose} disabled={saving || statusValue === 'CLOSED'}>
                  {saving && savingMode === 'close' ? 'Closing…' : 'Close Case'}
                </button>
                <button className="btn" type="button" onClick={onArchive} disabled={saving || statusValue === 'ARCHIVED'}>
                  {saving && savingMode === 'archive' ? 'Archiving…' : 'Archive Case'}
                </button>
              </div>
            </div>

            <form className="caseDetailForm" onSubmit={onSubmit}>
              <div className="caseDetailEditGrid">
                <label>
                  <span>Title</span>
                  <input value={draft.title} onChange={(event) => onFieldChange('title', event.target.value)} />
                </label>
                <label>
                  <span>SID</span>
                  <input value={draft.sid} onChange={(event) => onFieldChange('sid', event.target.value)} />
                </label>
                <label>
                  <span>Environment</span>
                  <input value={draft.environment} onChange={(event) => onFieldChange('environment', event.target.value)} />
                </label>
                <label>
                  <span>Severity</span>
                  <select value={draft.severity} onChange={(event) => onFieldChange('severity', event.target.value)}>
                    <option value="INFO">INFO</option>
                    <option value="WARN">WARN</option>
                    <option value="CRIT">CRIT</option>
                  </select>
                </label>
                <label>
                  <span>Status</span>
                  <select value={draft.status} onChange={(event) => onFieldChange('status', event.target.value)}>
                    <option value="OPEN">OPEN</option>
                    <option value="IN_PROGRESS">IN_PROGRESS</option>
                    <option value="CLOSED">CLOSED</option>
                    <option value="ARCHIVED">ARCHIVED</option>
                  </select>
                </label>
                <label className="caseDetailEditWide">
                  <span>Top Anomaly</span>
                  <input value={draft.top_anomaly} onChange={(event) => onFieldChange('top_anomaly', event.target.value)} />
                </label>
                <label className="caseDetailEditWide">
                  <span>Top Suspect</span>
                  <input value={draft.top_suspect} onChange={(event) => onFieldChange('top_suspect', event.target.value)} />
                </label>
                <label className="caseDetailEditWide">
                  <span>Executive Summary</span>
                  <textarea value={draft.summary} onChange={(event) => onFieldChange('summary', event.target.value)} rows={4} />
                </label>
              </div>
              <div className="caseDetailFormFoot">
                <button className="btn primary" type="submit" disabled={saving}>
                  {saving && savingMode === 'save' ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </article>

          <div className="caseDetailSections">
            <article className="caseDetailPanel">
              <div className="caseDetailSectionHead">
                <p className="sectionKicker">Timeline</p>
                <span>Latest 20</span>
              </div>
              <TimelineList items={caseData.timeline || []} />
            </article>

            <article className="caseDetailPanel">
              <div className="caseDetailSectionHead">
                <p className="sectionKicker">Parsed Results</p>
                <span>Latest 10</span>
              </div>
              <ParsedResults items={caseData.parsed_results || []} />
            </article>

            <article className="caseDetailPanel">
              <div className="caseDetailSectionHead">
                <p className="sectionKicker">Linked Evidence</p>
                <span>{caseData.evidence?.length || 0} files</span>
              </div>
              <EvidenceList items={caseData.evidence || []} />
            </article>
          </div>
        </>
      )}
    </section>
  )
}
