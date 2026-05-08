import React from 'react'

const defaultFmt = (v, d = 1) =>
  Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: d })

function summarizeSuspectEvidence(suspect, analysisLike = {}, fmt = defaultFmt) {
  const avgMem = (analysisLike.timeline || []).length
    ? analysisLike.timeline.reduce((sum, t) => sum + (t.memoryPct || 0), 0) / analysisLike.timeline.length
    : 0

  const evidenceFor = [
    suspect.critHits ? `Appears as CRIT ${suspect.critHits} time(s).` : '',
    suspect.hits ? `Appears ${suspect.hits} time(s) across uploaded WP-SCOUT snapshots.` : '',
    suspect.spikeHits ? `Matches incident window ${suspect.spikeHits} time(s).` : '',
    `Same Program + ErrorCode + JobName repeated: ${suspect.program} / ${suspect.errorCode} / ${suspect.jobName}.`,
    suspect.maxCpu ? `CPU activity reached ${fmt(suspect.maxCpu)}%.` : '',
  ].filter(Boolean)

  const evidenceAgainst = [
    suspect.maxRssGb < 8 ? `RSS is only ${fmt(suspect.maxRssGb)} GB, so this is not a memory-exhaustion proof.` : '',
    avgMem && avgMem < 75 ? `Host memory average is around ${fmt(avgMem)}%, not saturated in uploaded snapshots.` : '',
    analysisLike.st03nConfidence < 60 ? 'ST03N correlation is partial; WP-SCOUT evidence is stronger than workload correlation.' : '',
  ].filter(Boolean)

  return { evidenceFor, evidenceAgainst }
}

function classifySuspectProblemType(suspect, timeline = []) {
  if (!suspect) return { primary: 'Unknown', secondary: 'Insufficient evidence' }

  const avgMem = timeline.length
    ? timeline.reduce((sum, t) => sum + (t.memoryPct || 0), 0) / timeline.length
    : 0

  if (suspect.type === 'BTC' && suspect.critHits > 0 && suspect.errorCode !== '?') {
    return {
      primary: 'Recurring BTC / ABAP error pattern',
      secondary: avgMem < 75 ? 'Not host memory saturation' : 'Memory pressure also present',
    }
  }

  if (/DBSQL|SQL|DUPLICATE/i.test(suspect.errorCode)) {
    return { primary: 'Database/application data error pattern', secondary: 'Check repeated job/program evidence' }
  }

  if (/TIME_OUT/i.test(suspect.errorCode)) {
    return { primary: 'Timeout / long-running work process', secondary: 'Validate recurrence and incident-window match' }
  }

  if (suspect.maxRssGb >= 16) {
    return { primary: 'High RSS work process', secondary: 'Validate whether it matches the incident window' }
  }

  return {
    primary: 'Recurring work process anomaly',
    secondary: 'Evidence comes from uploaded WP-SCOUT snapshots',
  }
}

export function GroupPanel({ title, rows = [], fmt = defaultFmt }) {
  return (
    <section className="resultPanel groupPanel">
      <h3>{title}</h3>
      <div className="groupList">
        {rows.slice(0, 8).map((row) => (
          <div key={row.name}>
            <b>{row.name}</b>
            <span>hits {row.hits} · CRIT {row.critHits} · WARN {row.warnHits} · max CPU {fmt(row.maxCpu)}%</span>
            {row.examples?.length ? <small>{row.examples.join(' · ')}</small> : null}
          </div>
        ))}
      </div>
    </section>
  )
}

export function SuspectDetail({ suspect, analysis, fmt = defaultFmt }) {
  if (!suspect) {
    return (
      <section className="resultPanel">
        <h3>Suspect Detail</h3>
        <p>No suspect selected.</p>
      </section>
    )
  }

  const ev = summarizeSuspectEvidence(suspect, analysis, fmt)
  const type = classifySuspectProblemType(suspect, analysis.timeline)

  return (
    <section className="resultPanel suspectDetail">
      <div className="detailHead">
        <div>
          <h3>Suspect Detail</h3>
          <strong>PID {suspect.pid} / WP {suspect.wp} / {suspect.type}</strong>
          <p>{suspect.program}</p>
        </div>
        <div className={`detailScore ${suspect.severity.toLowerCase()}`}>
          <span>{suspect.severity}</span>
          <b>{suspect.score}/100</b>
        </div>
      </div>

      <div className="factsGrid">
        <span>ErrorCode<b>{suspect.errorCode}</b></span>
        <span>JobName<b>{suspect.jobName}</b></span>
        <span>Hits<b>{suspect.hits}</b></span>
        <span>CRIT Hits<b>{suspect.critHits}</b></span>
        <span>Incident Match<b>{suspect.spikeHits}x</b></span>
        <span>Max CPU<b>{fmt(suspect.maxCpu)}%</b></span>
      </div>

      <div className="whyBox">
        <h4>Why ranked high?</h4>
        <ul>{suspect.why.map((w) => <li key={w}>{w}</li>)}</ul>
      </div>

      <div className="evidenceColumns">
        <div>
          <h4>Evidence For</h4>
          <ul>{ev.evidenceFor.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
        <div>
          <h4>Evidence Against / Limits</h4>
          <ul>{ev.evidenceAgainst.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      </div>

      <div className="interpretationBox">
        <h4>RCA Interpretation</h4>
        <p><b>{type.primary}.</b> {type.secondary}. The strongest evidence comes only from the uploaded WP-SCOUT/ST03N files.</p>
      </div>
    </section>
  )
}
