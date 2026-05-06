import React from 'react'
import Navbar from './components/Navbar.jsx'
import Footer from './components/Footer.jsx'
import ToolCard from './components/ToolCard.jsx'
import { tools, preloadTool } from './tools'

const APP_BUILD_STAMP = 'sap-20260507-rca-core-workspace'

const FORCE_UI_CSS = `
  .appShell .navbar .mobileBtn{display:none!important}
  @media(max-width:860px){.appShell .navbar .mobileBtn{display:inline-flex!important}}
  .appShell .navbar{background:rgba(2,8,10,.94)!important;border-bottom:1px solid rgba(203,244,238,.12)!important}
  .appShell .navInner{min-height:64px!important;gap:16px!important;width:min(100%,1480px)!important;margin:0 auto!important;padding:0 18px!important}
  .appShell .brandTitle{font-size:14px!important;letter-spacing:-.02em!important}.appShell .brandSub{font-size:11px!important;color:rgba(222,241,238,.58)!important}
  .appShell .navQuick a,.appShell .navLinks a{box-shadow:none!important}.appShell .navQuick a:nth-child(n+4){display:none!important}
  .appShell:not(.isTool) .container{width:min(100%,1380px)!important}.appShell:not(.isTool) .premiumHome{padding-top:22px!important}
  .appShell:not(.isTool) .premiumHero{grid-template-columns:minmax(0,1fr) 270px!important;gap:16px!important}.appShell:not(.isTool) .premiumHeroCopy{border-radius:22px!important;min-height:330px!important;padding:40px!important;background:linear-gradient(135deg,rgba(17,42,39,.92),rgba(5,14,16,.98))!important;border:1px solid rgba(203,244,238,.16)!important;box-shadow:0 18px 48px rgba(0,0,0,.28)!important}.appShell:not(.isTool) .premiumHero .heroTitle{font-size:clamp(36px,5vw,62px)!important;line-height:.98!important;letter-spacing:-.045em!important;max-width:760px!important}.appShell:not(.isTool) .premiumHero .heroSub{font-size:15px!important;max-width:720px!important;color:rgba(225,241,238,.72)!important}.appShell:not(.isTool) .premiumHeroPanel{border-radius:22px!important;padding:18px!important;background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.014))!important;box-shadow:0 12px 30px rgba(0,0,0,.22)!important}.appShell:not(.isTool) .heroPanelMetric{padding:16px!important;border-radius:16px!important;background:rgba(0,0,0,.12)!important}.appShell:not(.isTool) .premiumFlowGrid{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:12px!important}.appShell:not(.isTool) .premiumFlowCard{min-height:138px!important;border-radius:18px!important;box-shadow:0 12px 28px rgba(0,0,0,.18)!important}.appShell:not(.isTool) .premiumToolCards{grid-template-columns:repeat(3,minmax(0,1fr))!important}.appShell:not(.isTool) .premiumToolCards .toolCard{min-height:145px!important;border-radius:18px!important}

  .appShell.isTool .cmpWrap,.appShell.isTool .cmpWrap.cmpV2{padding:14px!important;background:#07110f!important;overflow-x:hidden!important}
  .appShell.isTool .cmpTopbar{border-radius:16px!important;margin:0 0 12px!important;background:linear-gradient(180deg,rgba(14,39,35,.98),rgba(6,17,16,.98))!important;box-shadow:0 12px 30px rgba(0,0,0,.24)!important}.appShell.isTool .cmpTopbarRow,.appShell.isTool .cmpTopbarRow2{padding:11px 14px!important}.appShell.isTool .kpiMini{border-radius:12px!important;background:rgba(255,255,255,.045)!important}
  .appShell.isTool .cmpMain{display:grid!important;grid-template-columns:360px 1fr!important;gap:14px!important;overflow:hidden!important;width:100%!important;max-width:100%!important}.appShell.isTool .cmpColLeft,.appShell.isTool .cmpColCenter,.appShell.isTool .cmpColRight{min-width:0!important;max-width:100%!important;gap:14px!important}.appShell.isTool .cmpColRight{grid-column:1 / -1!important}.appShell.isTool .panel{border-radius:16px!important;background:linear-gradient(180deg,rgba(255,255,255,.042),rgba(255,255,255,.014))!important;border:1px solid rgba(203,244,238,.13)!important;box-shadow:0 12px 30px rgba(0,0,0,.18)!important}.appShell.isTool .panelHead{min-height:46px!important;padding:10px 12px!important;background:rgba(255,255,255,.020)!important}.appShell.isTool .panelBody,.appShell.isTool .panelBodyNoPad,.appShell.isTool .panelToolsRow{padding:11px!important}
  .appShell.isTool .cmpSectionNav,.appShell.isTool .cmpWrap [class*="SectionNav"],.appShell.isTool .cmpWrap [class*="sectionNav"]{display:none!important}.appShell.isTool .trendGrid,.appShell.isTool .cmpChartReportGrid{display:none!important}.appShell.isTool #charts,.appShell.isTool .panel:has(.trendGrid),.appShell.isTool .panel:has(.cmpChartReportGrid){display:none!important}.appShell.isTool .chartBox,.appShell.isTool .chartBoxSmall{display:none!important}
  .appShell.isTool .tableWrap,.appShell.isTool .cmpVt,.appShell.isTool .cmpVtViewport{max-width:100%!important;overflow:auto!important;border-radius:12px!important}.appShell.isTool .cmpVtRow{min-height:34px!important}.appShell.isTool .summaryGrid.summaryGrid--ops{grid-template-columns:repeat(3,minmax(0,1fr))!important}.appShell.isTool .summaryCard{border-radius:13px!important}
  .sapPdfDock{position:fixed;right:20px;bottom:20px;z-index:9999;display:flex;align-items:center;gap:8px;padding:9px;border:1px solid rgba(203,244,238,.15);border-radius:999px;background:rgba(5,14,16,.94);box-shadow:0 14px 34px rgba(0,0,0,.32);backdrop-filter:blur(14px)}.sapPdfDock button{min-height:36px;border-radius:999px;border:1px solid rgba(45,212,191,.34);background:linear-gradient(135deg,rgba(45,212,191,.22),rgba(56,189,248,.10));color:#f6fffc;font-weight:950;padding:8px 13px;cursor:pointer}.sapPdfDock button:disabled{opacity:.55;cursor:wait}.sapPdfDock span{color:rgba(222,241,238,.62);font-size:12px;font-weight:850;padding-right:7px}
  @media(max-width:1180px){.appShell:not(.isTool) .premiumHero,.appShell:not(.isTool) .premiumFlowGrid,.appShell:not(.isTool) .premiumToolCards,.appShell.isTool .cmpMain{grid-template-columns:1fr!important}.appShell:not(.isTool) .premiumHeroCopy{min-height:unset!important}.appShell.isTool .cmpColRight{grid-column:auto!important}}
  @media print{.navbar,.sapPdfDock,.cmpActions,.panelTools button,.cmpSectionNav{display:none!important}.appShell.isTool .cmpWrap{background:#fff!important;color:#111!important}.appShell.isTool .panel,.appShell.isTool .cmpTopbar{box-shadow:none!important;border:1px solid #ddd!important;background:#fff!important;color:#111!important}.appShell.isTool .cmpMain{grid-template-columns:1fr!important}}
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
  React.useEffect(() => { const onHash = () => setRoute(parse()); window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash) }, [])
  return route
}

function ForceUiLayer(){
  React.useEffect(() => { let tag = document.getElementById('sap-force-ui-layer'); if (!tag) { tag = document.createElement('style'); tag.id = 'sap-force-ui-layer'; document.head.appendChild(tag) } tag.textContent = FORCE_UI_CSS }, [])
  return null
}

function ToolExportDock({ slug }){
  const [busy, setBusy] = React.useState(false)
  if (slug !== 'comparer') return null
  const exportPdf = async () => {
    const target = document.querySelector('.cmpWrap') || document.querySelector('.fullBleed')
    if (!target || busy) return
    setBusy(true)
    try {
      await new Promise((resolve) => setTimeout(resolve, 300))
      const [{ default: html2canvas }, jsPdfModule] = await Promise.all([import('html2canvas'), import('jspdf')])
      const JsPDF = jsPdfModule.jsPDF || jsPdfModule.default
      const canvas = await html2canvas(target, { scale: 1.35, backgroundColor: '#07110f', useCORS: true, logging: false, windowWidth: document.documentElement.scrollWidth })
      const pdf = new JsPDF('p', 'mm', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth(); const pageHeight = pdf.internal.pageSize.getHeight(); const margin = 8
      const imgWidth = pageWidth - margin * 2; const imgHeight = (canvas.height * imgWidth) / canvas.width; const img = canvas.toDataURL('image/png', 0.95)
      let heightLeft = imgHeight; let position = margin
      pdf.setFontSize(13); pdf.text('CBJ SAP RCA Evidence', margin, 7); pdf.addImage(img, 'PNG', margin, position + 4, imgWidth, imgHeight); heightLeft -= pageHeight - margin * 2
      while (heightLeft > 0) { pdf.addPage(); position = heightLeft - imgHeight + margin; pdf.addImage(img, 'PNG', margin, position, imgWidth, imgHeight); heightLeft -= pageHeight - margin * 2 }
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      pdf.save(`cbj-sap-rca-evidence-${stamp}.pdf`)
    } catch (err) { console.error('[SAP PDF Export] failed:', err); window.print() } finally { setBusy(false) }
  }
  return <div className="sapPdfDock"><button type="button" onClick={exportPdf} disabled={busy}>{busy ? 'Preparing PDF…' : 'Export PDF'}</button><span>RCA evidence</span></div>
}

function Home(){
  const [q, setQ] = React.useState(() => localStorage.getItem('sap_q') || '')
  const inputRef = React.useRef(null)
  React.useEffect(() => { localStorage.setItem('sap_q', q) }, [q])
  const filtered = React.useMemo(() => { const s = q.trim().toLowerCase(); if (!s) return tools; return tools.filter(t => (t.title + ' ' + t.short + ' ' + t.slug).toLowerCase().includes(s)) }, [q])
  React.useEffect(() => { tools.forEach(t => preloadTool?.(t.slug)) }, [])
  const commandFlows = [
    { n: '01', title: 'WP-SCOUT Root Cause', text: 'Upload two Daily Check logs, compare deltas, identify long-running WP, high RSS, RABAX/SXPG/RXMSG offenders.', href: '#/tool/comparer', tag: 'Open comparator' },
    { n: '02', title: 'ST03N Workload RCA', text: 'Use XLSX workload exports to rank response time, DB access, time profile, and transaction offenders.', href: '#/tool/analyzer', tag: 'Open analyzer' },
    { n: '03', title: 'Evidence Notes', text: 'Review logs, copy action notes, and prepare management-ready incident evidence.', href: '#/tool/logs', tag: 'Open logs' },
  ]
  return (
    <section className="container section premiumHome">
      <div className="premiumHero">
        <div className="premiumHeroCopy">
          <div className="eyebrow">SAP RCA Workspace</div>
          <h1 className="heroTitle">Find root cause from SAP evidence.</h1>
          <p className="heroSub">Focus on 3 core tools only: WP-SCOUT comparison, ST03N workload analysis, and log evidence. Helper modules are hidden until needed.</p>
          <div className="heroBadges"><span>WP-SCOUT</span><span>ST03N XLSX</span><span>RCA Notes</span><span>PDF Export</span></div>
          <div className="premiumHeroActions"><a className="btn primary" href="#/tool/comparer">Start RCA Compare</a><a className="btn secondary" href="#/tool/analyzer">Analyze XLSX</a><a className="btn ghost" href="#/tool/logs">Open Logs</a></div>
        </div>
        <aside className="premiumHeroPanel"><div className="heroPanelTop"><span>Workspace</span><strong>SAPDEV</strong></div><div className="heroPanelMetric"><b>3</b><span>Core RCA tools</span></div><div className="heroPanelMetric"><b>PDF</b><span>Evidence export</span></div><div className="heroPanelMetric"><b>Clean</b><span>No helper noise</span></div><div className="heroPanelNote">Development target: simple, reliable, evidence-first RCA workflow.</div></aside>
      </div>
      <div className="commandPanel premiumLauncher"><div className="homeBar"><div className="homeBarTitle"><strong>Command launcher</strong><span>Search only core RCA tools.</span></div><div className="searchWrap"><span className="searchIcon">⌕</span><input ref={inputRef} className="input" placeholder="Search RCA comparator, ST03N analyzer, logs..." value={q} onChange={(e) => setQ(e.target.value)} />{q && <button className="btn iconBtn clearBtn" type="button" onClick={() => setQ('')}>×</button>}</div><div className="quickLinks">{tools.map(t => <a key={t.slug} className="quickPill" href={`#/tool/${t.slug}`}><span>{t.icon}</span>{t.title}</a>)}</div></div></div>
      <div className="premiumFlowGrid">{commandFlows.map(flow => <a key={flow.n} className="premiumFlowCard" href={flow.href}><span>{flow.n}</span><strong>{flow.title}</strong><em>{flow.text}</em><b>{flow.tag} →</b></a>)}</div>
      <div className="sectionHead premiumSectionHead"><div><span className="sectionKicker">Core tools</span><h2>RCA workflow</h2></div><span className="sectionCount">{filtered.length} visible</span></div>
      <div className="toolCards premiumToolCards">{filtered.map((t, idx) => <ToolCard key={t.slug} slug={t.slug} icon={t.icon} title={`${idx + 1}. ${t.title}`} desc={t.short} href={`#/tool/${t.slug}`} onMouseEnter={() => preloadTool?.(t.slug)} />)}</div>
    </section>
  )
}

function About(){ return <section className="container section"><div className="card premiumInfoCard"><span className="sectionKicker">Runbook</span><h2 style={{marginTop:8}}>SAP RCA Runbook</h2><p className="muted" style={{lineHeight:1.6}}>Upload evidence, compare before/after snapshot, identify offender, export PDF, then prepare action notes for Basis/Infra follow-up.</p></div></section> }
function Contact(){ return <section className="container section"><div className="card premiumInfoCard"><span className="sectionKicker">Ops Contact</span><h2 style={{marginTop:8}}>Basis / Infra Coordination</h2><p className="muted" style={{lineHeight:1.6}}>Placeholder for PIC Basis, Infra, datacenter, and escalation contacts.</p></div></section> }
function NotFound(){ return <section className="container section"><div className="card premiumInfoCard"><span className="sectionKicker">404</span><h2 style={{marginTop:8}}>Page not found</h2><a className="btn primary" href="#/">Back to RCA Workspace</a></div></section> }

export default function App(){
  const route = useRoute(); const tool = route.name === 'tool' ? tools.find(t => t.slug === route.slug) : null; const ActiveTool = tool ? tool.Component : null
  return <div className={`appShell ${route.name === 'tool' ? 'isTool' : ''}`} data-build={APP_BUILD_STAMP}><ForceUiLayer/><Navbar/><main>{route.name === 'home' && <Home/>}{route.name === 'about' && <About/>}{route.name === 'contact' && <Contact/>}{route.name === 'tool' && ActiveTool && <React.Suspense fallback={<section className="container section"><div className="card">Loading SAP RCA module…</div></section>}><div className="fullBleed"><ActiveTool/></div><ToolExportDock slug={route.slug}/></React.Suspense>}{route.name === 'tool' && !ActiveTool && <section className="container section"><div className="card">Tool hidden or not found.</div></section>}{route.name === 'notfound' && <NotFound/>}</main>{route.name !== 'tool' && <Footer/>}</div>
}
