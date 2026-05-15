import React from 'react'
import {
  clampText,
  countItems,
  normalizeCorrelationSources,
  sanitizeCorrelationHosts,
  sanitizeWorkprocesses,
} from './rca-panel-utils.js'

export default function RCAFocusPanel({ caseData, correlation }) {
  const severity = String(correlation?.severity || caseData?.severity || 'INFO').toUpperCase()
  const confidence = Number(correlation?.confidence || 0)
  const rootCause = correlation?.top_root_cause || caseData?.top_suspect || caseData?.top_anomaly || 'Need more evidence before final RCA.'
  const hostState = sanitizeCorrelationHosts(correlation?.affected_hosts, 5)
  const workprocessState = sanitizeWorkprocesses(correlation?.related_workprocesses, 4)
  const sourceState = normalizeCorrelationSources(correlation?.correlation_sources || correlation?.tools, 4)
  const actions = Array.isArray(correlation?.recommended_actions) ? correlation.recommended_actions : []
  const primaryAction = actions[0] || 'Collect fresh WP-SCOUT, ST03N, and log evidence from the same incident window.'
  const evidenceState = `${countItems(caseData?.parsed_results)} parsed • ${countItems(caseData?.evidence) || countItems(caseData?.evidence_count)} evidence`
  const impactHost = hostState.items.length ? hostState.items.join(', ') : hostState.needsReview ? 'Host extraction needs review' : 'No affected host confirmed yet.'
  const sourceSummary = sourceState.items.length ? sourceState.items.join(', ') : 'No source correlation yet'

  return (
    <article className="caseDetailPanel caseDetailAnalyticsPanel rcaFocusPanel">
      <div className="intelHead">
        <span>RCA Focus</span>
        <div className="rcaFocusHeadBadges">
          <strong className={`rcaSeverityBadge is${severity.toLowerCase()}`}>{severity}</strong>
          <strong className="rcaConfidenceBadge">{confidence ? `${confidence}%` : 'Pending'}</strong>
        </div>
      </div>

      <div className="intelPanel rcaFocusBlock">
        <span className="rcaFieldLabel">Primary Suspect</span>
        <p className="rcaFocusPrimarySuspect">{rootCause}</p>
      </div>

      <div className="rcaMetaGrid rcaFocusSteps">
        <div className="rcaMetaCard">
          <span className="rcaFieldLabel">Impact Host</span>
          <strong>{impactHost}</strong>
        </div>

        <div className="rcaMetaCard">
          <span className="rcaFieldLabel">Evidence State</span>
          <strong>{evidenceState}</strong>
        </div>

        <div className="rcaMetaCard">
          <span className="rcaFieldLabel">Next Check</span>
          <strong>{clampText(primaryAction, 120)}</strong>
        </div>

        <div className="rcaMetaCard">
          <span className="rcaFieldLabel">Correlation Sources</span>
          <strong>{sourceSummary}</strong>
        </div>
      </div>

      <div className="rcaRecommendationBox">
        <span className="rcaFieldLabel">Recommended Next Check</span>
        <p>{primaryAction}</p>
        <div className="rcaChipRow">
          {workprocessState.items.length
            ? workprocessState.items.map((item) => <span key={item} className="rcaChip">{item}</span>)
            : <span className="rcaChip isMuted">No related WP detected</span>}
        </div>
      </div>
    </article>
  )
}
