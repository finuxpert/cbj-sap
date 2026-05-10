import React from 'react'

export default function PrimaryErrorPanel({ primary, status }) {
  return (
    <section className="evidencePanel">
      <h2>Primary Error Explanation</h2>
      {primary ? (
        <>
          <p>
            <b>{primary.name}</b> points to <b>{primary.family}</b>.
          </p>
          <p>{primary.meaning}</p>
          <div className="confidenceRows">
            <span>Hits<b>{primary.hits}</b></span>
            <span>CRIT<b>{primary.critHits}</b></span>
            <span>Files<b>{primary.files?.length || 0}</b></span>
          </div>
        </>
      ) : (
        <p>{status}</p>
      )}
    </section>
  )
}
