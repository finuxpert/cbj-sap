import React from 'react'
import Navbar from './components/Navbar.jsx'
import Footer from './components/Footer.jsx'
import ToolCard from './components/ToolCard.jsx'
import { tools, preloadTool } from './tools'

const APP_BUILD_STAMP = 'sap-20260507-elegant-pdf-workspace'

const FORCE_UI_CSS = `
  .appShell .navbar .mobileBtn{display:none!important}
  @media(max-width:860px){.appShell .navbar .mobileBtn{display:inline-flex!important}}
  .appShell .navbar{background:rgba(2,8,10,.92)!important;border-bottom:1px solid rgba(203,244,238,.12)!important}
  .appShell .navInner{min-height:68px!important;gap:18px!important}
  .appShell .brandTitle{font-size:15px!important;letter-spacing:-.02em!important}
  .appShell .brandSub{font-size:11px!important;color:rgba(222,241,238,.58)!important}
  .appShell .navQuick a,.appShell .navLinks a{box-shadow:none!important}
  .appShell:not(.isTool) .container{width:min(100%,1500px)!important}
  .appShell:not(.isTool) .premiumHome{padding-top:20px!important}
  .appShell:not(.isTool) .premiumHero{grid-template-columns:minmax(0,1fr) 300px!important;gap:18px!important}
  .appShell:not(.isTool) .premiumHeroCopy{border-radius:26px!important;min-height:430px!important;padding:48px!important;background:linear-gradient(135deg,rgba(23,52,48,.88),rgba(6,16,18,.96))!important;border:1px solid rgba(203,244,238,.16)!important;box-shadow:0 22px 60px rgba(0,0,0,.32)!important}
  .appShell:not(.isTool) .premiumHero .heroTitle{font-size:clamp(42px,5.8vw,74px)!important;line-height:.94!important;letter-spacing:-.055em!important;max-width:880px!important}
  .appShell:not(.isTool) .premiumHero .heroSub{font-size:16px!important;max-width:760px!important;color:rgba(225,241,238,.72)!important}
  .appShell:not(.isTool) .premiumHeroPanel{border-radius:26px!important;padding:20px!important;background:linear-gradient(180deg,rgba(255,255,255,.052),rgba(255,255,255,.018))!important;box-shadow:0 16px 42px rgba(0,0,0,.24)!important}
  .appShell:not(.isTool) .heroPanelMetric{padding:18px!important;border-radius:18px!important;background:rgba(0,0,0,.13)!important}
  .appShell:not(.isTool) .premiumFlowGrid{gap:14px!important}
  .appShell:not(.isTool) .premiumFlowCard{min-height:156px!important;border-radius:20px!important;box-shadow:0 14px 34px rgba(0,0,0,.20)!important}
  .appShell:not(.isTool) .premiumToolCards .toolCard{min-height:160px!important;border-radius:18px!important}

  .appShell.isTool .cmpWrap,.appShell.isTool .cmpWrap.cmpV2{padding:14px!important;background:#07110f!important;overflow-x:hidden!important}
  .appShell.isTool .cmpTopbar{border-radius:18px!important;margin:0 0 12px!important;background:linear-gradient(180deg,rgba(15,44,39,.96),rgba(7,19,18,.98))!important;box-shadow:0 16px 42px rgba(0,0,0,.28)!important}
  .appShell.isTool .cmpTopbarRow,.appShell.isTool .cmpTopbarRow2{padding:12px 14px!important}
  .appShell.isTool .kpiMini{border-radius:14px!important;background:rgba(255,255,255,.052)!important}
  .appShell.isTool .cmpMain{display:grid!important;grid-template-columns:1fr 1fr!important;gap:14px!important;overflow:hidden!important;width:100%!important;max-width:100%!important}
  .appShell.isTool .cmpColLeft,.appShell.isTool .cmpColCenter,.appShell.isTool .cmpColRight{min-width:0!important;max-width:100%!important;gap:14px!important}
  .appShell.isTool .panel{border-radius:18px!important;background:linear-gradient(180deg,rgba(255,255,255,.048),rgba(255,255,255,.016))!important;border:1px solid rgba(203,244,238,.14)!important;box-shadow:0 14px 38px rgba(0,0,0,.22)!important}
  .appShell.isTool .panelHead{min-height:48px!important;padding:11px 13px!important;background:rgba(255,255,255,.024)!important}
  .appShell.isTool .panelBody,.appShell.isTool .panelBodyNoPad,.appShell.isTool .panelToolsRow{padding:12px!important}
  .appShell.isTool .cmpSectionNav,.appShell.isTool .cmpWrap [class*="SectionNav"],.appShell.isTool .cmpWrap [class*="sectionNav"]{position:static!important;inset:auto!important;transform:none!important;translate:none!important;width:100%!important;max-width:100%!important;height:auto!important;display:flex!important;flex-direction:row!important;align-items:center!important;justify-content:flex-start!important;gap:8px!important;padding:10px 12px!important;margin:0!important;border:0!important;border-top:1px solid rgba(203,244,238,.12)!important;border-radius:0!important;background:rgba(0,0,0,.18)!important;box-shadow:none!important;overflow-x:auto!important;z-index:1!important;backdrop-filter:none!important}
  .appShell.isTool .cmpSectionNav:before,.appShell.isTool .cmpSectionNav:after,.appShell.isTool .cmpWrap [class*="SectionNav"]:before,.appShell.isTool .cmpWrap [class*="SectionNav"]:after,.appShell.isTool .cmpWrap [class*="sectionNav"]:before,.appShell.isTool .cmpWrap [class*="sectionNav"]:after{display:none!important;content:none!important}
  .appShell.isTool .cmpSectionNav a,.appShell.isTool .cmpWrap [class*="SectionNav"] a,.appShell.isTool .cmpWrap [class*="sectionNav"] a{position:static!important;flex:0 0 auto!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;width:auto!important;min-width:auto!important;height:32px!important;padding:8px 12px!important;margin:0!important;border-radius:999px!important;border:1px solid rgba(203,244,238,.14)!important;background:rgba(255,255,255,.055)!important;color:rgba(225,241,238,.76)!important;font-size:11px!important;line-height:1!important;white-space:nowrap!important;box-shadow:none!important}
  .appShell.isTool .trendGrid,.appShell.isTool .cmpChartReportGrid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:14px!important;padding:14px!important;width:100%!important;max-width:100%!important;overflow:hidden!important}
  .appShell.isTool .chartBox,.appShell.isTool .chartBoxSmall{height:320px!important;min-height:320px!important;border-radius:18px!important;overflow:hidden!important;background:rgba(0,0,0,.10)!important}
  .appShell.isTool .recharts-wrapper,.appShell.isTool .recharts-responsive-container{width:100%!important;height:100%!important;min-width:0!important;max-width:100%!important}
  .appShell.isTool .recharts-surface{overflow:visible!important}
  .appShell.isTool .tableWrap,.appShell.isTool .cmpVt,.appShell.isTool .cmpVtViewport{max-width:100%!important;overflow:auto!important;border-radius:14px!important}
  .sapPdfDock{position:fixed;right:22px;bottom:22px;z-index:9999;display:flex;align-items:center;gap:8px;padding:10px;border:1px solid rgba(203,244,238,.16);border-radius:999px;background:rgba(5,14,16,.92);box-shadow:0 16px 42px rgba(0,0,0,.36);backdrop-filter:blur(16px)}
  .sapPdfDock button{min-height:38px;border-radius:999px;border:1px solid rgba(45,212,191,.34);background:linear-gradient(135deg,rgba(45,212,191,.22),rgba(56,189,248,.10));color:#f6fffc;font-weight:950;padding:8px 14px;cursor:pointer}.sapPdfDock button:disabled{opacity:.55;cursor:wait}.sapPdfDock span{color:rgba(222,241,238,.62);font-size:12px;font-weight:850;padding-right:8px}
  @media(max-width:1280px){.appShell:not(.isTool) .premiumHero,.appShell.isTool .cmpMain,.appShell.isTool .trendGrid,.appShell.isTool .cmpChartReportGrid{grid-template-columns:1fr!important}.appShell:not(.isTool) .premiumHeroCopy{min-height:unset!important}}
  @media print{.navbar,.sapPdfDock,.cmpActions,.panelTools button,.cmpSectionNav{display:none!important}.appShell.isTool .cmpWrap{background:#fff!important;color:#111!important}.appShell.isTool .panel,.appShell.isTool .cmpTopbar{box-shadow:none!important;border:1px solid #ddd!important;background:#fff!important;color:#111!important}.appShell.isTool .cmpMain,.appShell.isTool .trendGrid{grid-template-columns:1fr!important}.appShell.isTool .chartBox{break-inside:avoid}}
`

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

function ForceUiLayer(){
  React.useEffect(() => {
    let tag = document.getElementById('sap-force-ui-layer')
    if (!tag) {
      tag = document.createElement('style')
      tag.id = 'sap-force-ui-layer'
      document.head.appendChild(tag)
    }
    tag.textContent = FORCE_UI_CSS
  }, [])
  return null
}

function ToolExportDock({ slug }){
  const [busy, setBusy] = React.useState(false)
  const isComparer = slug === 'comparer'
  if (!isComparer) return null

  const exportPdf = async () => {
    const target = document.querySelector('.cmpWrap') || document.querySelector('.fullBleed')
    if (!target || busy) return
    setBusy(true)
    try {
      await new Promise((resolve) => setTimeout(resolve, 300))
      const [{ default: html2canvas }, jsPdfModule] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])
      const JsPDF = jsPdfModule.jsPDF || jsPdfModule.default
      const canvas = await html2canvas(target, {
        scale: 1.35,
        backgroundColor: '#07110f',
        useCORS: true,
        logging: false,
        windowWidth: document.documentElement.scrollWidth,
      })
      const pdf = new JsPDF('p', 'mm', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 8
      const imgWidth = pageWidth - margin * 2
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      const img = canvas.toDataURL('image/png', 0.95)
      let heightLeft = imgHeight
      let position = margin

      pdf.setFontSize(13)
      pdf.text('CBJ SAP Daily Check / WP-SCOUT Evidence', margin, 7)
      pdf.addImage(img, 'PNG', margin, position + 4, imgWidth, imgHeight)
      heightLeft -= pageHeight - margin * 2

      while (heightLeft > 0) {
        pdf.addPage()
        position = heightLeft - imgHeight + margin
        pdf.addImage(img, 'PNG', margin, position, imgWidth, imgHeight)
        heightLeft -= pageHeight - margin * 2
      }
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      pdf.save(`cbj-sap-comparer-evidence-${stamp}.pdf`)
    } catch (err) {
      console.error('[SAP PDF Export] failed:', err)
      window.print()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sapPdfDock">
      <button type="button" onClick={exportPdf} disabled={busy}>{busy ? 'Preparing PDF…' : 'Export PDF'}</button>
      <span>Evidence view</span>
    </div>
  )
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
    { n: '01', title: 'Daily check evidence', text: 'Compare WP-SCOUT snapshots, identify deltas, and prepare clean operational evidence.', href: '#/tool/comparer', tag: 'Comparer' },
    { n: '02', title: 'Workload analysis', text: 'Analyze ST03N exports, rank offenders, and support Basis follow-up with clear numbers.', href: '#/tool/analyzer', tag: 'Analyzer' },
    { n: '03', title: 'RCA package', text: 'Turn logs and findings into a compact report for incident, DR, or change review.', href: '#/tool/logs', tag: 'Logs' },
  ]

  return (
    <section className="container section premiumHome">
      <div className="premiumHero">
        <div className="premiumHeroCopy">
          <div className="eyebrow">SAP Basis Command Center</div>
          <h1 className="heroTitle">Simple evidence. Faster SAP decisions.</h1>
          <p className="heroSub">
            A clean workspace for daily checks, WP-SCOUT comparison, ST03N analysis, log triage, and export-ready evidence.
          </p>
          <div className="heroBadges" aria-label="Workspace capabilities">
            <span>WP-SCOUT</span><span>ST03N</span><span>RCA Evidence</span><span>PDF Export</span>
          </div>
          <div className="premiumHeroActions">
            <a className="btn primary" href="#/tool/comparer">Start Daily Check</a>
            <a className="btn secondary" href="#/tool/analyzer">Open ST03N Analyzer</a>
            <button className="btn ghost" type="button" onClick={() => inputRef.current?.focus()}>Search Tools</button>
          </div>
        </div>

        <aside className="premiumHeroPanel" aria-label="Operations summary">
          <div className="heroPanelTop"><span>Workspace Status</span><strong>SAPDEV</strong></div>
          <div className="heroPanelMetric"><b>{tools.length}</b><span>Active modules</span></div>
          <div className="heroPanelMetric"><b>{featuredTools.length}</b><span>Primary flows</span></div>
          <div className="heroPanelMetric"><b>{filtered.length}</b><span>Visible result</span></div>
          <div className="heroPanelNote">Dev route for safe improvements before production release.</div>
        </aside>
      </div>

      <div className="commandPanel premiumLauncher">
        <div className="homeBar">
          <div className="homeBarTitle"><strong>Command launcher</strong><span>Press Ctrl+K, search a tool, or use number keys 1–9.</span></div>
          <div className="searchWrap">
            <span className="searchIcon" aria-hidden="true">⌕</span>
            <input ref={inputRef} className="input" placeholder="Search comparer, analyzer, logs, backup, deploy..." value={q} onChange={(e) => setQ(e.target.value)} />
            {q && <button className="btn iconBtn clearBtn" type="button" onClick={() => setQ('')} aria-label="Clear search">×</button>}
          </div>
          <div className="quickLinks" aria-label="Quick tools">
            {featuredTools.map(t => <a key={t.slug} className="quickPill" href={`#/tool/${t.slug}`} onMouseEnter={() => preloadTool?.(t.slug)}><span>{t.icon}</span>{t.title}</a>)}
          </div>
        </div>
      </div>

      <div className="premiumFlowGrid">
        {commandFlows.map(flow => <a key={flow.n} className="premiumFlowCard" href={flow.href}><span>{flow.n}</span><strong>{flow.title}</strong><em>{flow.text}</em><b>{flow.tag} →</b></a>)}
      </div>

      <div className="sectionHead premiumSectionHead"><div><span className="sectionKicker">Available modules</span><h2>Choose the next operation</h2></div><span className="sectionCount">{filtered.length} visible</span></div>

      <div className="toolCards premiumToolCards">
        {filtered.map((t, idx) => <ToolCard key={t.slug} slug={t.slug} icon={t.icon} title={`${idx + 1}. ${t.title}`} desc={t.short} href={`#/tool/${t.slug}`} onMouseEnter={() => preloadTool?.(t.slug)} />)}
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
        <p className="muted" style={{lineHeight:1.6}}>This dashboard is built for SAP Basis/Infra work: fast triage, clear visualization, evidence-first exports, and operational handoff.</p>
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
        <p className="muted" style={{lineHeight:1.6}}>Placeholder for PIC Basis, Infra, datacenter, and escalation contacts.</p>
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
      <ForceUiLayer />
      <Navbar/>
      <main>
        {route.name === 'home' && <Home/>}
        {route.name === 'about' && <About/>}
        {route.name === 'contact' && <Contact/>}

        {route.name === 'tool' && ActiveTool && (
          <React.Suspense fallback={<section className="container section"><div className="card">Loading SAP module…</div></section>}>
            <div className="fullBleed"><ActiveTool/></div>
            <ToolExportDock slug={route.slug} />
          </React.Suspense>
        )}

        {route.name === 'tool' && !ActiveTool && <section className="container section"><div className="card">Tool not found.</div></section>}
        {route.name === 'notfound' && <NotFound/>}
      </main>
      {route.name !== "tool" && <Footer/>}
    </div>
  )
}
