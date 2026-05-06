import React from 'react'
import Navbar from './components/Navbar.jsx'
import Footer from './components/Footer.jsx'
import ToolCard from './components/ToolCard.jsx'
import { tools, preloadTool } from './tools'

const APP_BUILD_STAMP = 'sap-20260501-0602'

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
    // Preload common tools for a snappier first use (idle so it doesn't block first paint)
    const idle = window.requestIdleCallback || ((fn) => setTimeout(() => fn({ timeRemaining: () => 0 }), 250))
    const id = idle(() => {
      preloadTool?.('comparer')
      preloadTool?.('analyzer')
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
    () => tools.filter(t => ['comparer', 'analyzer', 'logs'].includes(t.slug)),
    [],
  )

  return (
    <section className="container section">
      <div className="hero">
        <div className="heroCopy">
          <div className="eyebrow">Basis Operations Workspace</div>
          <h1 className="heroTitle">SAP Basis Tools</h1>
          <p className="heroSub">
            One workspace for daily checks, workload evidence, log triage, and recovery routines.
          </p>
          <div className="heroBadges" aria-label="Workspace capabilities">
            <span>ST03N Analysis</span>
            <span>Daily Evidence</span>
            <span>RCA Ready</span>
          </div>
        </div>
        <div className="heroActions">
          <a className="btn primary" href="#/tool/comparer">Open Comparer</a>
          <a className="btn secondary" href="#/tool/analyzer">Analyze ST03N</a>
        </div>
      </div>

      <div className="opsStrip" aria-label="Workspace summary">
        <div className="opsMetric">
          <span className="opsValue">{tools.length}</span>
          <span className="opsLabel">Tools</span>
        </div>
        <div className="opsMetric">
          <span className="opsValue">{featuredTools.length}</span>
          <span className="opsLabel">Primary flows</span>
        </div>
        <div className="opsMetric">
          <span className="opsValue">{filtered.length}</span>
          <span className="opsLabel">Visible now</span>
        </div>
      </div>

      <div className="intelligenceGrid">
        <section className="intelPanel">
          <div className="intelHead">
            <span>Ops Intelligence</span>
            <strong>State → Delta → Action</strong>
          </div>
          <div className="intelSteps">
            <a href="#/tool/comparer">
              <span>01</span>
              <strong>Baseline daily check</strong>
              <em>Compare SAP health signals before and after change windows.</em>
            </a>
            <a href="#/tool/analyzer">
              <span>02</span>
              <strong>Rank workload offenders</strong>
              <em>Surface ST03N response, DB, roll wait, and high-volume pain points.</em>
            </a>
            <a href="#/tool/logs">
              <span>03</span>
              <strong>Convert logs to RCA</strong>
              <em>Group evidence by host, timestamp, component, and next check.</em>
            </a>
          </div>
        </section>
        <section className="intelPanel intelPanel--compact">
          <div className="intelHead">
            <span>Workspace Mode</span>
            <strong>Analyst density</strong>
          </div>
          <p>
            Designed for war-room screens: compact panels, sticky tables, high-contrast dark mode, and evidence-first exports.
          </p>
          <div className="intelMiniStats" aria-label="Workspace highlights">
            <span>Fast triage</span>
            <span>Compact view</span>
            <span>Export friendly</span>
          </div>
        </section>
      </div>

      <div className="commandPanel">
        <div className="homeBar">
          <div className="homeBarTitle">
            <strong>Tool launcher</strong>
            <span>Search or open common SAP workflows quickly.</span>
          </div>
          <div className="searchWrap">
            <span className="searchIcon" aria-hidden="true">⌕</span>
            <input
              ref={inputRef}
              className="input"
              placeholder="Search tools"
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
              <a key={t.slug} className="quickPill" href={`#/tool/${t.slug}`}>
                <span>{t.icon}</span>
                {t.title}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="sectionHead">
        <div>
          <span className="sectionKicker">Available tools</span>
          <h2>Choose an operation</h2>
        </div>
        <span className="sectionCount">{filtered.length} visible</span>
      </div>

      <div className="toolCards">
        {filtered.map((t) => (
          <ToolCard
            key={t.slug}
            slug={t.slug}
            icon={t.icon}
            title={t.title}
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
      <div className="card">
        <h2 style={{marginTop:0}}>About</h2>
        <p className="muted" style={{lineHeight:1.5}}>
          This dashboard is built for SAP operations (Basis/Infra):
          optimized for fast triage, clear visualization, and evidence that&apos;s easy to bring into a war-room.
        </p>
        <div className="row gap-10 wrap" style={{marginTop:12}}>
          <a className="btn primary" href="#/">Back to Home</a>
          <a className="btn ghost" href="#/tool/comparer">Open Comparer</a>
        </div>
      </div>
    </section>
  )
}

function Contact(){
  return (
    <section className="container section">
      <div className="card">
        <h2 style={{marginTop:0}}>Contact</h2>
        <p className="muted" style={{lineHeight:1.5}}>
          Isi halaman ini sesuai kebutuhan internal (PIC Basis / infra / ops). Saat ini placeholder.
        </p>
      </div>
    </section>
  )
}

function NotFound(){
  return (
    <section className="container section">
      <div className="card">
        <h2 style={{marginTop:0}}>Not Found</h2>
        <p className="muted">Page not found.</p>
        <a className="btn primary" href="#/">Back to Home</a>
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
          <React.Suspense fallback={<section className="container section"><div className="card">Loading…</div></section>}>
            {/* Tool pages are intentionally full-width. Each tool handles its own layout. */}
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
