import React from 'react'
import { DecisionCard } from '../../EvidenceDecisionKit.jsx'

export default function SummaryStrip({ analysis, primary, status }) {
  return (
    <section className="decisionBoard">
      <DecisionCard
        label="Primary Error"
        value={primary?.name || 'Pending'}
        hint={analysis?.summary || status}
        tone={primary ? 'good' : ''}
      />
      <DecisionCard
        label="Error Family"
        value={primary?.family || 'Unknown'}
        hint={primary?.meaning || 'Upload logs to classify error family'}
        tone="blue"
      />
      <DecisionCard
        label="Owner Direction"
        value={primary?.owner || 'Pending'}
        hint={analysis?.nextAction || 'Based only on uploaded evidence pattern'}
      />
      <DecisionCard
        label="Confidence"
        value={`${analysis?.confidence || 0}%`}
        hint={analysis?.confidenceText || `${analysis?.rows?.length || 0} parsed rows`}
      />
    </section>
  )
}
