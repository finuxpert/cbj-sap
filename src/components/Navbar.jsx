import React from 'react'
import { tools, preloadTool } from '../tools'

const secondaryItems = [
  { slug: 'reports', label: 'Reports', icon: '◫', href: '#/st03n' },
  { slug: 'configuration', label: 'Configuration', icon: '⚙', href: '#/st03n' },
  { slug: 'systems', label: 'Systems', icon: '▣', href: '#/log', inactive: true },
  { slug: 'alerts', label: 'Alerts', icon: '△', href: '#/log', inactive: true },
  { slug: 'dumps', label: 'Dumps', icon: '▤', href: '#/log', inactive: true },
  { slug: 'spool', label: 'Spool', icon: '▥', href: '#/log', inactive: true },
  { slug: 'jobs', label: 'Jobs', icon: '▧', href: '#/log', inactive: true },
]

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
            <span className="sapBadge">SAP</span>
            <span className="brandText">
              <span className="brandTitle">SAP RCA Workspace</span>
              <span className="brandSub">ST03N &amp; Log Evidence Console</span>
            </span>
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
          <div className="compactRcaSidebarSection muted">Workspace</div>
          {secondaryItems.map((item) => (
            <a key={item.slug} href={item.href} data-active="false" data-inactive={item.inactive ? 'true' : 'false'}>
              <span>{item.icon}</span>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="compactRcaSidebarBottom">
          <a href="#/st03n"><span>⚙</span>Settings</a>
        </div>
      </aside>
    </>
  )
}
