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
        <span>Analytics Scope</span>
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
      <CaseDetail caseId={caseId} />
      <section className="caseDetailPage container section caseDetailAnalyticsMount">
        <div className="caseAnalyticsTopbar">
          <a href="#case-analytics">Jump to Analytics</a>
          <span>{loadingAnalytics ? 'Loading analytics data…' : 'Analytics loaded from Case History API'}</span>
        </div>
        {caseData ? (
          <>
            <AnalyticsQuickSummary caseData={caseData} />
            <CaseAnalytics caseData={caseData} />
          </>
        ) : (
          <article className="caseDetailPanel caseDetailAnalyticsPanel">
            <div className="caseDetailChartEmpty">Analytics data is not available yet.</div>
          </article>
        )}
      </section>
    </>
  )
}
