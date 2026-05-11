import React from 'react'

export default function CorrelationSummary({ correlation, loading }) {
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
