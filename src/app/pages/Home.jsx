import React from 'react'
import ToolCard from '../../components/ToolCard.jsx'
import { tools, preloadTool } from '../../tools'

export default function Home() {
  const [q, setQ] = React.useState(() => localStorage.getItem('sap_q') || '')

  React.useEffect(() => {
    localStorage.setItem('sap_q', q)
  }, [q])

  React.useEffect(() => {
    tools.forEach((tool) => preloadTool?.(tool.slug))
  }, [])

  const filtered = React.useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return tools
    return tools.filter((t) => `${t.title} ${t.short} ${t.slug}`.toLowerCase().includes(s))
  }, [q])

  return (
    <section className="container section premiumHome sapCleanHome">
      <div className="premiumHero sapCleanHero">
        <div className="premiumHeroCopy">
          <div className="eyebrow">SAP Intelligent RCA</div>
          <h1 className="heroTitle">Evidence-driven SAP Basis RCA.</h1>
          <p className="heroSub">One clean workspace for Comparator, ST03N Analyzer, Log Triage, and server-side Evidence History.</p>
          <div className="premiumHeroActions">
            <a className="btn primary" href="#/tool/comparer">RCA Comparator</a>
            <a className="btn secondary" href="#/tool/analyzer">ST03N Analyzer</a>
            <a className="btn ghost" href="#/tool/logs">Log Triage</a>
          </div>
        </div>
      </div>

      <div className="commandPanel premiumLauncher sapCleanLauncher">
        <div className="homeBar">
          <div className="homeBarTitle">
            <strong>RCA Launcher</strong>
            <span>Three core tools only. Helper modules stay hidden.</span>
          </div>
          <div className="searchWrap">
            <span className="searchIcon">⌕</span>
            <input className="input" placeholder="Search Comparator, ST03N, Logs..." value={q} onChange={(e) => setQ(e.target.value)} />
            {q && <button className="btn iconBtn clearBtn" type="button" onClick={() => setQ('')}>×</button>}
          </div>
        </div>
      </div>

      <div className="sectionHead premiumSectionHead">
        <div>
          <span className="sectionKicker">Core tools</span>
          <h2>Investigation workflow</h2>
        </div>
        <span className="sectionCount">{filtered.length} visible</span>
      </div>

      <div className="toolCards premiumToolCards sapCleanToolCards">
        {filtered.map((tool) => (
          <ToolCard
            key={tool.slug}
            slug={tool.slug}
            icon={tool.icon}
            title={tool.title}
            desc={tool.short}
            href={`#/tool/${tool.slug}`}
            onMouseEnter={() => preloadTool?.(tool.slug)}
          />
        ))}
      </div>
    </section>
  )
}
