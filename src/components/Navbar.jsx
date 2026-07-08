import React from 'react'
import { tools, preloadTool } from '../tools'
import sapRcaLogo from '../assets/sap-rca-workspace-logo.svg'

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [route, setRoute] = React.useState(() =>
    typeof window !== 'undefined' ? (window.location.hash.replace('#/', '') || 'st03n') : 'st03n',
  )

  React.useEffect(() => {
    const onHash = () => {
      setRoute(window.location.hash.replace('#/', '') || 'st03n')
      setMobileOpen(false)
    }
    window.addEventListener('hashchange', onHash)
    onHash()
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const active = React.useCallback(
    (slug) => (route === slug || route.startsWith(`${slug}/`)) ? 'true' : 'false',
    [route],
  )
  const currentTool = tools.find((tool) => active(tool.slug) === 'true') || tools[0]
  const currentLabel = currentTool?.slug === 'log' ? 'Work Process Log Console' : 'ST03N Workload Analyzer'

  return (
    <>
      <header className="navbar rcaNav finalNav compactRcaTopbar">
        <div className="navInner rcaNavInner compactRcaTopbarInner">
          <a className="brand rcaBrand compactRcaBrand" href="#/st03n" aria-label="SAP RCA Workspace home">
            <img className="compactRcaLogo" src={sapRcaLogo} alt="SAP RCA Workspace" />
          </a>

          <div className="compactRcaCrumb" aria-label="Current RCA module">
            <span>Evidence Console</span>
            <strong>{currentLabel}</strong>
          </div>

          <div className="compactRcaUtility" aria-hidden="true">
            <small>ABAPSYS<br />PRD · 00</small>
          </div>

          <button className="btn iconBtn mobileBtn" type="button" onClick={() => setMobileOpen((value) => !value)} aria-label="Toggle menu">
            {mobileOpen ? '×' : '☰'}
          </button>

          {mobileOpen && (
            <div className="mobileNavDock">
              <div className="mobilePanel finalMobilePanel">
                <div className="mobilePanelTitle">SAP RCA Workspace</div>
                <div className="row wrap gap-10">
                  {tools.map((tool) => (
                    <a className="btn" data-active={active(tool.slug)} key={tool.slug} href={`#/${tool.slug}`}>{tool.title}</a>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      <aside className="compactRcaSidebar" aria-label="SAP RCA workspace navigation">
        <div className="sidebarTopGlyph" aria-hidden="true">⋮⋮</div>
        <nav>
          <div className="compactRcaSidebarSection">Active tools</div>
          {tools.map((tool) => (
            <a
              key={`side-${tool.slug}`}
              href={`#/${tool.slug}`}
              data-active={active(tool.slug)}
              onMouseEnter={() => preloadTool?.(tool.slug)}
            >
              <span>{tool.slug === 'st03n' ? '▦' : '▤'}</span>
              {tool.title === 'Log' ? 'Log' : 'ST03N'}
            </a>
          ))}
        </nav>
      </aside>
    </>
  )
}
