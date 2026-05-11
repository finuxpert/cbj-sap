import React from 'react'

export default function SessionReplayPanel({ replay, loading }) {
  if (loading) {
    return (
      <article className="caseDetailPanel caseDetailAnalyticsPanel">
        <div className="caseDetailChartEmpty">Building investigation replay timeline...</div>
      </article>
    )
  }

  if (!replay?.replay_ready) return null

  const events = Array.isArray(replay?.events) ? replay.events.slice(0, 10) : []

  return (
    <article className="caseDetailPanel caseDetailAnalyticsPanel">
      <div className="intelHead">
        <span>Investigation Replay Timeline</span>
        <strong>{events.length} Events</strong>
      </div>

      <div className="workbenchChecklist">
        {events.map((event, index) => (
          <div className="workbenchCheck" key={`${event?.source_id || index}-${event?.time || 'na'}`}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <div>
              <strong>
                {String(event?.type || 'event').toUpperCase()} • {String(event?.severity || 'INFO').toUpperCase()}
              </strong>
              <div>{event?.title || 'Replay event'}</div>
              <small>
                {event?.tool || 'unknown-tool'}
                {event?.time ? ` • ${event.time}` : ''}
              </small>
            </div>
          </div>
        ))}
      </div>
    </article>
  )
}
