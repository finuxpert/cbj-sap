import React from 'react'
import { getMobileCase } from '../../evidence-api-client.js'
import CaseDetail from './CaseDetail.jsx'
import CaseAnalytics from './CaseAnalytics.jsx'

function normalizeCase(payload) {
  return payload?.case || payload?.item || payload || null
}

function countItems(value) {
  return Array.isArray(value) ? value.length : Number(value || 0) || 0
}

function AnalyticsQuickSummary({ caseData }) {
  const evidenceCount = countItems(caseData?.evidence) || countItems(caseData?.evidence_count)
  const parsedCount = countItems(caseData?.parsed_results)
  const reportCount = countItems(caseData?.reports) || countItems(caseData?.report_count)
  const severity = String(caseData?.severity || 'INFO').toUpperCase()

  return (
    <div className="caseAnalyticsQuickSummary" id="case-analytics">
      <div>
        <span>Case</span>
        <strong>{caseData?.case_no || caseData?.id || 'Case Detail'}</strong>
      </div>
      <div>
        <span>Severity</span>
        <strong>{severity}</strong>
      </div>
      <div>
        <span>Evidence</span>
        <strong>{evidenceCount}</strong>
      </div>
      <div>
        <span>Parsed</span>
        <strong>{parsedCount}</strong>
      </div>
      <div>
        <span>Reports</span>
        <strong>{reportCount}</strong>
      </div>
    </div>
  )
}

function CaseDashboardHero({ caseData, loadingAnalytics }) {
  const title = caseData?.title || caseData?.case_no || caseData?.id || 'Case Detail'
  const summary = caseData?.executive_summary || caseData?.summary || 'RCA dashboard summary will appear after the case data is loaded.'
  const status = String(caseData?.status || 'OPEN').toUpperCase()
  const severity = String(caseData?.severity || 'INFO').toUpperCase()

  return (
    <section className="caseDashboardHero">
      <div>
        <p className="sectionKicker">Case RCA Dashboard</p>
        <h1>{title}</h1>
        <p>{summary}</p>
      </div>
      <div className="caseDashboardMeta">
        <span>{loadingAnalytics ? 'SYNCING' : status}</span>
        <strong>{severity}</strong>
        <a href="#case-detail-full">Open Full Detail</a>
      </div>
    </section>
  )
}

function AnalyticsBlock({ caseData, loadingAnalytics }) {
  return (
    <section className="caseDetailPage container section caseDetailAnalyticsMount">
      <CaseDashboardHero caseData={caseData} loadingAnalytics={loadingAnalytics} />
      {caseData ? (
        <>
          <AnalyticsQuickSummary caseData={caseData} />
          <CaseAnalytics caseData={caseData} />
        </>
      ) : (
        <article className="caseDetailPanel caseDetailAnalyticsPanel">
          <div className="caseDetailChartEmpty">Analytics data is loading or not available yet.</div>
        </article>
      )}
    </section>
  )
}

export default function CaseDetailWithAnalytics({ caseId }) {
  const [caseData, setCaseData] = React.useState(null)
  const [loadingAnalytics, setLoadingAnalytics] = React.useState(false)

  React.useEffect(() => {
    let active = true
    if (!caseId) return undefined

    setLoadingAnalytics(true)
    getMobileCase(caseId)
      .then((payload) => {
        if (!active || payload?.ok === false) return
        setCaseData(normalizeCase(payload))
      })
      .catch(() => {
        if (active) setCaseData(null)
      })
      .finally(() => {
        if (active) setLoadingAnalytics(false)
      })

    return () => {
      active = false
    }
  }, [caseId])

  return (
    <>
      <AnalyticsBlock caseData={caseData} loadingAnalytics={loadingAnalytics} />
      <section className="caseDetailPage container section caseFullDetailShell" id="case-detail-full">
        <div className="caseFullDetailHead">
          <div>
            <p className="sectionKicker">Full Case Detail</p>
            <h2>Detail, edit form, timeline, parsed result, and linked evidence</h2>
          </div>
          <a href="#case-analytics">Back to Analytics</a>
        </div>
      </section>
      <CaseDetail caseId={caseId} />
    </>
  )
}
