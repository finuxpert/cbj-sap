import React from 'react'
import { getCaseCorrelation, getMobileCase } from '../../evidence-api-client.js'
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

function CorrelationSummary({ correlation, loading }) {
  if (loading) {
    return (
      <article className="caseDetailPanel caseDetailAnalyticsPanel">
        <div className="caseDetailChartEmpty">Correlation engine is analyzing RCA signals...</div>
      </article>
    )
  }

  if (!correlation) return null

  const severity = String(correlation?.severity || 'INFO').toUpperCase()
  const confidence = Number(correlation?.confidence || 0)
  const topRootCause = correlation?.top_root_cause || 'No dominant root-cause detected yet.'
  const hosts = Array.isArray(correlation?.affected_hosts) ? correlation.affected_hosts : []
  const workprocesses = Array.isArray(correlation?.related_workprocesses) ? correlation.related_workprocesses : []
  const tools = Array.isArray(correlation?.tools) ? correlation.tools : []
  const actions = Array.isArray(correlation?.recommended_actions)
    ? correlation.recommended_actions.slice(0, 3)
    : []

  return (
    <article className="caseDetailPanel caseDetailAnalyticsPanel caseCorrelationSummary" data-rca-correlation="true">
      <div className="intelHead">
        <span>RCA Correlation Summary</span>
        <strong data-correlation-severity>{severity}</strong>
      </div>

      <div className="opsStrip" style={{ marginBottom: 16 }}>
        <div className="opsMetric">
          <span className="opsLabel">Confidence</span>
          <strong className="opsValue" data-correlation-confidence>{confidence}%</strong>
        </div>
        <div className="opsMetric">
          <span className="opsLabel">Correlated Tools</span>
          <strong className="opsValue">{tools.length}</strong>
        </div>
        <div className="opsMetric">
          <span className="opsLabel">Affected Hosts</span>
          <strong className="opsValue">{hosts.length}</strong>
        </div>
      </div>

      <div className="intelPanel" style={{ marginBottom: 16 }}>
        <div className="intelHead">
          <span>Top Root Cause</span>
          <strong>{severity}</strong>
        </div>
        <p data-correlation-root-cause>{topRootCause}</p>
      </div>

      <div className="intelSteps" style={{ marginBottom: 16 }}>
        <div>
          <span>Hosts</span>
          <strong>{hosts.length ? hosts.join(', ') : 'No affected host detected'}</strong>
        </div>
        <div>
          <span>Workprocesses</span>
          <strong>{workprocesses.length ? workprocesses.join(', ') : 'No related WP detected'}</strong>
        </div>
        <div>
          <span>Correlation Sources</span>
          <strong>{tools.length ? tools.join(', ') : 'No source correlation yet'}</strong>
        </div>
      </div>

      {actions.length > 0 && (
        <div className="intelPanel intelPanel--compact">
          <div className="intelHead">
            <span>Recommended Actions</span>
            <strong>{actions.length} Actions</strong>
          </div>
          <div className="workbenchChecklist">
            {actions.map((action, index) => (
              <div className="workbenchCheck" key={`${index}-${action}`}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div>{action}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
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

function AnalyticsBlock({ caseData, correlation, loadingAnalytics, loadingCorrelation }) {
  return (
    <section className="caseDetailPage container section caseDetailAnalyticsMount">
      <CaseDashboardHero caseData={caseData} loadingAnalytics={loadingAnalytics} />
      {caseData ? (
        <>
          <AnalyticsQuickSummary caseData={caseData} />
          <CorrelationSummary correlation={correlation} loading={loadingCorrelation} />
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
  const [loadingAnalytics, setLoadingAnalytics] = React.useState(false)
  const [loadingCorrelation, setLoadingCorrelation] = React.useState(false)

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

  return (
    <>
      <AnalyticsBlock
        caseData={caseData}
        correlation={correlation}
        loadingAnalytics={loadingAnalytics}
        loadingCorrelation={loadingCorrelation}
      />
      <FullCaseDetailDisclosure caseId={caseId} />
    </>
  )
}
