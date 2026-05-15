import React from 'react'
import {
  clampText,
  normalizeCorrelationSources,
  sanitizeCorrelationHosts,
  sanitizeWorkprocesses,
} from './rca-panel-utils.js'

export default function CorrelationSummary({ correlation, loading }) {
  const [showAllHosts, setShowAllHosts] = React.useState(false)

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
  const hostState = sanitizeCorrelationHosts(correlation?.affected_hosts, showAllHosts ? 32 : 5)
  const workprocessState = sanitizeWorkprocesses(correlation?.related_workprocesses, 6)
  const sourceState = normalizeCorrelationSources(correlation?.correlation_sources || correlation?.tools, 8)
  const tools = sourceState.all
  const actions = Array.isArray(correlation?.recommended_actions)
    ? correlation.recommended_actions.slice(0, 3)
    : []
  const nextCheck = actions[0] || correlation?.next_check || 'Collect more cross-tool evidence before final RCA.'

  return (
    <article className="caseDetailPanel caseDetailAnalyticsPanel caseCorrelationSummary" data-rca-correlation="true">
      <div className="intelHead">
        <span>RCA Correlation Summary</span>
        <strong className={`rcaSeverityBadge is${severity.toLowerCase()}`} data-correlation-severity>{severity}</strong>
      </div>

      <div className="opsStrip rcaKpiRow">
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
          <strong className="opsValue">{hostState.all.length}</strong>
        </div>
      </div>

      <div className="intelPanel rcaRootCauseCard">
        <span className="rcaFieldLabel">Top Root Cause</span>
        <p className="rcaRootCauseText" data-correlation-root-cause>{topRootCause}</p>
        <small>{clampText(correlation?.summary || correlation?.root_cause || nextCheck, 180)}</small>
      </div>

      <div className="rcaCorrelationGrid">
        <div className="intelPanel intelPanel--compact">
          <div className="intelHead">
            <span>Evidence Correlation</span>
            <strong>{tools.length || 0} Sources</strong>
          </div>
          <div className="rcaCorrelationDetailGrid">
            <div className="rcaMetaCard">
              <span className="rcaFieldLabel">Sources</span>
              <div className="rcaChipRow">
                {sourceState.items.length
                  ? sourceState.items.map((item) => <span key={item} className="rcaChip">{item}</span>)
                  : <span className="rcaChip isMuted">No source correlation yet</span>}
              </div>
            </div>

            <div className="rcaMetaCard">
              <span className="rcaFieldLabel">Workprocess</span>
              <div className="rcaChipRow">
                {workprocessState.items.length
                  ? workprocessState.items.map((item) => <span key={item} className="rcaChip">{item}</span>)
                  : <span className="rcaChip isMuted">No related WP detected</span>}
              </div>
            </div>

            <div className="rcaMetaCard">
              <span className="rcaFieldLabel">Hosts</span>
              {hostState.items.length ? (
                <>
                  <div className="rcaChipRow">
                    {hostState.items.map((item) => <span key={item} className="rcaChip">{item}</span>)}
                  </div>
                  {hostState.hiddenCount > 0 ? (
                    <button className="rcaLinkButton" type="button" onClick={() => setShowAllHosts((value) => !value)}>
                      {showAllHosts ? 'Show fewer hosts' : `Show more (${hostState.hiddenCount})`}
                    </button>
                  ) : null}
                </>
              ) : (
                <strong>{hostState.needsReview ? 'Host extraction needs review' : 'No affected host detected'}</strong>
              )}
            </div>

            <div className="rcaMetaCard">
              <span className="rcaFieldLabel">Next Check</span>
              <strong>{clampText(nextCheck, 140)}</strong>
            </div>
          </div>
        </div>
      </div>

      {actions.length > 0 && (
        <div className="intelPanel intelPanel--compact rcaRecommendationPanel">
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
