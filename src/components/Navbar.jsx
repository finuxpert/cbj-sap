import React from 'react'
import { tools, preloadTool } from '../tools'

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

  return (
    <header className="navbar rcaNav finalNav">
      <div className="navInner rcaNavInner">
        <a className="brand rcaBrand" href="#/st03n" aria-label="SAP RCA Workspace home">
          <span className="brandBadge">RCA</span>
          <span className="brandText">
            <span className="brandTitle">SAP RCA Workspace</span>
            <span className="brandSub">ST03N &amp; Log Evidence Console</span>
          </span>
        </a>

        <nav className="navQuick rcaToolTabs" aria-label="RCA tools">
          {tools.map((tool) => (
            <a
              key={tool.slug}
              href={`#/${tool.slug}`}
              data-active={active(tool.slug)}
              aria-current={active(tool.slug) === 'true' ? 'page' : undefined}
              onMouseEnter={() => preloadTool?.(tool.slug)}
            >
              {tool.title}
            </a>
          ))}
        </nav>

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
  )
}
