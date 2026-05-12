import React from 'react'

function clamp(value) {
  const number = Number(value || 0)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(100, Math.round(number)))
}

function scoreTone(score) {
  if (score >= 85) return 'crit'
  if (score >= 60) return 'warn'
  return 'info'
}

function ScoreRow({ label, score, detail }) {
  const value = clamp(score)
  return (
    <div className="scoreBreakdownRow" data-tone={scoreTone(value)}>
      <div>
        <b>{label}</b>
        <span>{detail}</span>
      </div>
      <strong>{value}</strong>
    </div>
  )
}

export default function ScoringBreakdownPanel({ analysis }) {
  if (!analysis) return null

  const primary = analysis.primary || {}
  const infra = analysis.infra_saturation || {}
  const owner = analysis.ownership_direction || {}
  const rows = analysis.rows || []
  const fileCount = analysis.files?.length || 0
  const timelineCount = analysis.timeline?.length || 0
  const sourceCount = new Set(rows.map((row) => row?.source).filter(Boolean)).size
  const criticalScore = Math.min(100, Number(primary.critHits || 0) * 22)
  const recurrenceScore = Math.min(100, Number(primary.hits || 0) * 12)
  const coverageScore = Math.min(100, fileCount * 18 + sourceCount * 16 + timelineCount * 4)
  const infraScore = clamp(infra.score)
  const ownershipScore = Math.max(
    ...((owner.scores || []).map((item) => clamp(item.score))),
    owner.primary_owner && owner.primary_owner !== 'UNKNOWN' ? 60 : 0,
  )
  const confidence = clamp(analysis.confidence)

  return (
    <section className="evidencePanel scoringBreakdownPanel" data-confidence={scoreTone(confidence)}>
      <div className="intelHead">
        <span>RCA Scoring Breakdown</span>
        <strong>{confidence}% confidence</strong>
      </div>
      <p className="mutedText">
        Breakdown ini menjelaskan kenapa hasil RCA dianggap kuat atau masih perlu evidence tambahan.
      </p>
      <div className="scoreBreakdownGrid">
        <ScoreRow label="Critical Signal" score={criticalScore} detail={`${primary.critHits || 0} critical hit(s) dari strongest error.`} />
        <ScoreRow label="Recurring Pattern" score={recurrenceScore} detail={`${primary.hits || 0} occurrence pada signature utama.`} />
        <ScoreRow label="Evidence Coverage" score={coverageScore} detail={`${fileCount} file · ${sourceCount} source · ${timelineCount} timeline bucket.`} />
        <ScoreRow label="Infra Pressure" score={infraScore} detail={infra.verdict || 'Belum ada CPU/MEM/SWAP signal kuat.'} />
        <ScoreRow label="Ownership Direction" score={ownershipScore} detail={owner.reason || `Primary owner: ${owner.primary_owner || primary.owner || 'UNKNOWN'}.`} />
      </div>
      <div className="evidenceList compact">
        <div>
          <b>Primary RCA Candidate</b>
          <span>{primary.name || 'Not confirmed yet'}</span>
        </div>
        <div>
          <b>Supporting Summary</b>
          <span>{analysis.summary || analysis.confidenceText || 'Upload more evidence to improve score.'}</span>
        </div>
      </div>
    </section>
  )
}
