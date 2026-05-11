import React from 'react'
import { countItems } from './rca-panel-utils.js'

export default function RCAFocusPanel({ caseData, correlation }) {
  const severity = String(correlation?.severity || caseData?.severity || 'INFO').toUpperCase()
  const confidence = Number(correlation?.confidence || 0)
  const rootCause = correlation?.top_root_cause || caseData?.top_suspect || caseData?.top_anomaly || 'Need more evidence before final RCA.'
  const hosts = Array.isArray(correlation?.affected_hosts) ? correlation.affected_hosts : []
  const workprocesses = Array.isArray(correlation?.related_workprocesses) ? correlation.related_workprocesses : []
  const actions = Array.isArray(correlation?.recommended_actions) ? correlation.recommended_actions : []
  const primaryAction = actions[0] || 'Collect fresh WP-SCOUT, ST03N, and log evidence from the same incident window.'

  const impact = [
    hosts.length ? `Host: ${hosts.slice(0, 3).join(', ')}` : '',
    workprocesses.length ? `WP: ${workprocesses.slice(0, 3).join(', ')}` : '',
  ].filter(Boolean).join(' • ') || caseData?.summary || 'Impact context is not confirmed yet.'

  return (
    <article className="caseDetailPanel caseDetailAnalyticsPanel" style={{ position: 'sticky', top: 72, zIndex: 5 }}>
      <div className="intelHead">
        <span>RCA Focus</span>
        <strong>{severity}</strong>
      </div>

      <div className="intelPanel" style={{ marginBottom: 12 }}>
        <div className="intelHead">
          <span>Primary Suspect</span>
          <strong>{confidence ? `${confidence}%` : 'Pending'}</strong>
        </div>

        <p style={{ fontSize: 18, fontWeight: 850, lineHeight: 1.35 }}>
          {rootCause}
        </p>
      </div>

      <div className="intelSteps" style={{ marginBottom: 12 }}>
        <div>
          <span>Impact</span>
          <strong>{impact}</strong>
        </div>

        <div>
          <span>Next Check</span>
          <strong>{primaryAction}</strong>
        </div>

        <div>
          <span>Evidence State</span>
          <strong>
            {countItems(caseData?.parsed_results)} parsed • {' '}
            {countItems(caseData?.evidence) || countItems(caseData?.evidence_count)} evidence
          </strong>
        </div>
      </div>
    </article>
  )
}
