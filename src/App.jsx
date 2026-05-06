import React from 'react'
import Navbar from './components/Navbar.jsx'
import Footer from './components/Footer.jsx'
import ToolCard from './components/ToolCard.jsx'
import { tools, preloadTool } from './tools'

const APP_BUILD_STAMP = 'sap-20260507-premium-command-center'

function useRoute(){
  const parse = () => {
    const h = window.location.hash.slice(1) || '/'
    const p = h.split('/').filter(Boolean)
    if (p.length === 0) return { name:'home' }
    if (p[0] === 'tool' && p[1]) return { name:'tool', slug:p[1] }
    if (p[0] === 'about') return { name:'about' }
    if (p[0] === 'contact') return { name:'contact' }
    return { name:'notfound' }
  }

  const [route, setRoute] = React.useState(parse)

  React.useEffect(() => {
    const onHash = () => setRoute(parse())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return route
}

function Home(){
  const [q, setQ] = React.useState(() => localStorage.getItem('sap_q') || '')
  const inputRef = React.useRef(null)

  React.useEffect(() => { localStorage.setItem('sap_q', q) }, [q])

  const filtered = React.useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return tools
    return tools.filter(t =>
      (t.title + ' ' + t.short + ' ' + t.slug).toLowerCase().includes(s)
    )
  }, [q])

  React.useEffect(() => {
    const idle = window.requestIdleCallback || ((fn) => setTimeout(() => fn({ timeRemaining: () => 0 }), 250))
    const id = idle(() => {
      preloadTool?.('comparer')
      preloadTool?.('analyzer')
      preloadTool?.('logs')
      preloadTool?.('metrics')
    })
    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(id)
      else clearTimeout(id)
    }
  }, [])

  React.useEffect(() => {
    const onKey = (e) => {
      const k = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && k === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (!q && !e.ctrlKey && !e.metaKey && /^[0-9]$/.test(e.key)) {
        const idx = (e.key === '0' ? 9 : (parseInt(e.key, 10) - 1))
        const t = filtered[idx]
        if (t) window.location.hash = `#/tool/${t.slug}`
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [q, filtered])

  const featuredTools = React.useMemo(
    () => tools.filter(t => ['comparer', 'analyzer', 'logs', 'metrics'].includes(t.slug)),
    [],
  )

  const commandFlows = [
    {
      n: '01',
      title: 'Baseline & compare',
      text: 'Upload daily check / WP-SCOUT logs, compare snapshots, and isolate deltas before/after change windows.',
      href: '#/tool/comparer',
      tag: 'Comparer',
    },
    {
      n: '02',
      title: 'Workload triage',
      text: 'Analyze ST03N exports, rank offenders, and prepare evidence for SAP Basis follow-up.',
      href: '#/tool/analyzer',
      tag: 'Analyzer',
    },
    {
      n: '03',
      title: 'RCA evidence pack',
      text: 'Convert logs and snapshots into clean notes, charts, and export-ready operational evidence.',
      href: '#/tool/logs',
      tag: 'Logs',
    },
  ]

  return (
    <section className="container section premiumHome">
      <div className="premiumHero">
        <div className="premiumHeroCopy">
          <div className="eyebrow">SAP Basis Command Center</div>
          <h1 className="heroTitle">Operate SAP with cleaner evidence, faster triage, and less chaos.</h1>
          <p className="heroSub">
            A focused workspace for daily checks, WP-SCOUT comparison, ST03N workload analysis, log triage,
            deploy evidence, and recovery routines.
          </p>
          <div className="heroBadges" aria-label="Workspace capabilities">
            <span>WP-SCOUT</span>
            <span>ST03N</span>
            <span>RCA Evidence</span>
            <span>Deploy Ready</span>
          </div>
          <div className="premiumHeroActions">
            <a className="btn primary" href="#/tool/comparer">Start Daily Check</a>
            <a className="btn secondary" href="#/tool/analyzer">Open ST03N Analyzer</a>
            <button className="btn ghost" type="button" onClick={() => inputRef.current?.focus()}>Search Tools</button>
          </div>
        </div>

        <aside className="premiumHeroPanel" aria-label="Operations summary">
          <div className="heroPanelTop">
            <span>Workspace Status</span>
            <strong>SAPDEV</strong>
          </div>
          <div className="heroPanelMetric">
            <b>{tools.length}</b>
            <span>Active modules</span>
          </div>
          <div className="heroPanelMetric">
            <b>{featuredTools.length}</b>
            <span>Primary flows</span>
          </div>
          <div className="heroPanelMetric">
            <b>{filtered.length}</b>
            <span>Visible result</span>
          </div>
          <div className="heroPanelNote">Dev route for safe improvements before production release.</div>
        </aside>
      </div>

      <div className="commandPanel premiumLauncher">
        <div className="homeBar">
          <div className="homeBarTitle">
            <strong>Command launcher</strong>
            <span>Press Ctrl+K, search a tool, or use number keys 1–9 from the homepage.</span>
          </div>
          <div className="searchWrap">
            <span className="searchIcon" aria-hidden="true">⌕</span>
            <input
              ref={inputRef}
              className="input"
              placeholder="Search comparer, analyzer, logs, backup, deploy..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {q && (
              <button className="btn iconBtn clearBtn" type="button" onClick={() => setQ('')} aria-label="Clear search">
                ×
              </button>
            )}
          </div>
          <div className="quickLinks" aria-label="Quick tools">
            {featuredTools.map(t => (
              <a key={t.slug} className="quickPill" href={`#/tool/${t.slug}`} onMouseEnter={() => preloadTool?.(t.slug)}>
                <span>{t.icon}</span>
                {t.title}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="premiumFlowGrid">
        {commandFlows.map(flow => (
          <a key={flow.n} className="premiumFlowCard" href={flow.href}>
            <span>{flow.n}</span>
            <strong>{flow.title}</strong>
            <em>{flow.text}</em>
            <b>{flow.tag} →</b>
          </a>
        ))}
      </div>

      <div className="sectionHead premiumSectionHead">
        <div>
          <span className="sectionKicker">Available modules</span>
          <h2>Choose the next operation</h2>
        </div>
        <span className="sectionCount">{filtered.length} visible</span>
      </div>

      <div className="toolCards premiumToolCards">
        {filtered.map((t, idx) => (
          <ToolCard
            key={t.slug}
            slug={t.slug}
            icon={t.icon}
            title={`${idx + 1}. ${t.title}`}
            desc={t.short}
            href={`#/tool/${t.slug}`}
            onMouseEnter={() => preloadTool?.(t.slug)}
          />
        ))}
      </div>
    </section>
  )
}

function About(){
  return (
    <section className="container section">
      <div className="card premiumInfoCard">
        <span className="sectionKicker">Runbook</span>
        <h2 style={{marginTop:8}}>SAP Basis Operations Workspace</h2>
        <p className="muted" style={{lineHeight:1.6}}>
          This dashboard is built for SAP Basis/Infra work: fast triage, clear visualization, evidence-first exports,
          and operational handoff for incident, DR, daily check, and workload review routines.
        </p>
        <div className="premiumFlowGrid" style={{marginTop:18}}>
          <a className="premiumFlowCard" href="#/tool/comparer"><span>01</span><strong>Compare</strong><em>Daily check and WP-SCOUT evidence.</em><b>Open →</b></a>
          <a className="premiumFlowCard" href="#/tool/analyzer"><span>02</span><strong>Analyze</strong><em>ST03N workload and response time ranking.</em><b>Open →</b></a>
          <a className="premiumFlowCard" href="#/tool/logs"><span>03</span><strong>RCA</strong><em>Turn raw logs into action notes.</em><b>Open →</b></a>
        </div>
      </div>
    </section>
  )
}

function Contact(){
  return (
    <section className="container section">
      <div className="card premiumInfoCard">
        <span className="sectionKicker">Ops Contact</span>
        <h2 style={{marginTop:8}}>Basis / Infra Coordination</h2>
        <p className="muted" style={{lineHeight:1.6}}>
          Placeholder for PIC Basis, Infra, datacenter, and escalation contacts. Keep this area clean and focused for
          operational handoff.
        </p>
      </div>
    </section>
  )
}

function NotFound(){
  return (
    <section className="container section">
      <div className="card premiumInfoCard">
        <span className="sectionKicker">404</span>
        <h2 style={{marginTop:8}}>Page not found</h2>
        <p className="muted">The requested SAP workspace route does not exist.</p>
        <a className="btn primary" href="#/">Back to Command Center</a>
      </div>
    </section>
  )
}

export default function App(){
  const route = useRoute()
  const tool = route.name === 'tool' ? tools.find(t => t.slug === route.slug) : null
  const ActiveTool = tool ? tool.Component : null

  return (
    <div className={`appShell ${route.name === "tool" ? "isTool" : ""}`} data-build={APP_BUILD_STAMP}>
      <Navbar/>
      <main>
        {route.name === 'home' && <Home/>}
        {route.name === 'about' && <About/>}
        {route.name === 'contact' && <Contact/>}

        {route.name === 'tool' && ActiveTool && (
          <React.Suspense fallback={<section className="container section"><div className="card">Loading SAP module…</div></section>}>
            <div className="fullBleed">
              <ActiveTool/>
            </div>
          </React.Suspense>
        )}

        {route.name === 'tool' && !ActiveTool && (
          <section className="container section"><div className="card">Tool not found.</div></section>
        )}

        {route.name === 'notfound' && <NotFound/>}
      </main>
      {route.name !== "tool" && <Footer/>}
    </div>
  )
}
