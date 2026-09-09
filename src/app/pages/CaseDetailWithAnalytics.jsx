import React from 'react'
import './case-workspace-panels.css'
import { getCaseCorrelation, getCaseReplay, getMobileCase } from '../../evidence-api-client.js'
import CaseDetail from './CaseDetail.jsx'
import CaseAnalytics from './CaseAnalytics.jsx'
import SphereFocusPanel from './SphereFocusPanel.jsx'
import CorrelationSummary from './CorrelationSummary.jsx'
import SessionReplayPanel from './SessionReplayPanel.jsx'
import { countItems } from './sphere-panel-utils.js'

function normalizeCase(payload) {
  return payload?.case || payload?.item || payload || null
}

function stageLabel(value) {
  return String(value || 'INTAKE').trim().toUpperCase() || 'INTAKE'
}

function AnalyticsQuickSummary({ caseData }) {
  const evidenceCount = countItems(caseData?.evidence) || countItems(caseData?.evidence_count)
  const parsedCount = countItems(caseData?.parsed_results)
  const reportCount = countItems(caseData?.reports) || countItems(caseData?.report_count)
  const severity = String(caseData?.severity || 'INFO').toUpperCase()
  const stage = stageLabel(caseData?.case_stage)

  return (
    <div className="caseAnalyticsQuickSummary" id="case-analytics">
      <div>
        <span>Case</span>
        <strong>{caseData?.case_no || caseData?.id || 'Case Detail'}</strong>
      </div>
      <div>
        <span>SPHERE Stage</span>
        <strong>{stage}</strong>
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
  const summary = caseData?.executive_summary || caseData?.summary || 'SPHERE dashboard summary will appear after the case data is loaded.'
  const status = String(caseData?.status || 'OPEN').toUpperCase()
  const severity = String(caseData?.severity || 'INFO').toUpperCase()
  const stage = stageLabel(caseData?.case_stage)

  return (
    <section className="caseDashboardHero">
      <div>
        <p className="sectionKicker">Case SPHERE Dashboard</p>
        <h1>{title}</h1>
        <p>{summary}</p>
      </div>
      <div className="caseDashboardMeta">
        <span>{loadingAnalytics ? 'SYNCING' : status}</span>
        <span>{stage}</span>
        <strong>{severity}</strong>
        <a href="#case-detail-full">Open Full Detail</a>
      </div>
    </section>
  )
}

function AnalyticsBlock({ caseData, correlation, replay, loadingAnalytics, loadingCorrelation, loadingReplay }) {
  return (
    <section className="caseDetailPage container section caseDetailAnalyticsMount">
      <CaseDashboardHero caseData={caseData} loadingAnalytics={loadingAnalytics} />
      {caseData ? (
        <>
          <SphereFocusPanel caseData={caseData} correlation={correlation} />
          <AnalyticsQuickSummary caseData={caseData} />
          <CorrelationSummary correlation={correlation} loading={loadingCorrelation} />
          <SessionReplayPanel replay={replay} loading={loadingReplay} />
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

function FullCaseDetailDisclosure({ caseId }) {
  return (
    <section className="caseDetailPage container section caseFullDetailShell" id="case-detail-full">
      <details className="caseFullDetailDisclosure">
        <summary>
          <div>
            <p className="sectionKicker">Full Case Detail</p>
            <h2>Edit case, timeline, parsed result, and linked evidence</h2>
          </div>
          <span>Open</span>
        </summary>
        <div className="caseFullDetailBody">
          <CaseDetail caseId={caseId} />
        </div>
      </details>
    </section>
  )
}

export default function CaseDetailWithAnalytics({ caseId }) {
  const [caseData, setCaseData] = React.useState(null)
  const [correlation, setCorrelation] = React.useState(null)
  const [replay, setReplay] = React.useState(null)
  const [loadingAnalytics, setLoadingAnalytics] = React.useState(false)
  const [loadingCorrelation, setLoadingCorrelation] = React.useState(false)
  const [loadingReplay, setLoadingReplay] = React.useState(false)

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

  React.useEffect(() => {
    let active = true
    if (!caseId) return undefined

    setLoadingCorrelation(true)
    getCaseCorrelation(caseId)
      .then((payload) => {
        if (!active || payload?.ok === false) return
        setCorrelation(payload?.correlation || null)
      })
      .catch(() => {
        if (active) setCorrelation(null)
      })
      .finally(() => {
        if (active) setLoadingCorrelation(false)
      })

    return () => {
      active = false
    }
  }, [caseId])

  React.useEffect(() => {
    let active = true
    if (!caseId) return undefined

    setLoadingReplay(true)
    getCaseReplay(caseId)
      .then((payload) => {
        if (!active || payload?.ok === false) return
        setReplay(payload)
      })
      .catch(() => {
        if (active) setReplay(null)
      })
      .finally(() => {
        if (active) setLoadingReplay(false)
      })

    return () => {
      active = false
    }
  }, [caseId])

  return (
    <>
      <AnalyticsBlock
        caseData={caseData}
        correlation={correlation}
        replay={replay}
        loadingAnalytics={loadingAnalytics}
        loadingCorrelation={loadingCorrelation}
        loadingReplay={loadingReplay}
      />
      <FullCaseDetailDisclosure caseId={caseId} />
    </>
  )
}
