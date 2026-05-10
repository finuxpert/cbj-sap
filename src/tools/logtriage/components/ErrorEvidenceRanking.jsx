import React from 'react'
import { fmt } from '../../evidence-utils.js'

export default function ErrorEvidenceRanking({ errorGroups = [] }) {
  return (
    <section className="evidencePanel">
      <h2>Error Evidence Ranking</h2>
      <div className="evidenceList">
        {errorGroups.slice(0, 12).map((item) => (
          <div key={item.name}>
            <b>{item.name}</b>
            <span>{item.family} · owner {item.owner}</span>
            <small>
              hits {item.hits} · CRIT {item.critHits} · max CPU {fmt(item.maxCpu)}% · {item.examples.join(' · ')}
            </small>
          </div>
        ))}
      </div>
    </section>
  )
}
