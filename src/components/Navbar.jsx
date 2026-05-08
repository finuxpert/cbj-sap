import React from 'react'
import { getCurrentHashRoute } from '../app/routeUtils.js'
import { tools, preloadTool } from '../tools'

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [route, setRoute] = React.useState(getCurrentHashRoute)

  React.useEffect(() => {
    const onHash = () => {
      setRoute(getCurrentHashRoute())
      setMobileOpen(false)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const active = React.useCallback(
    (href) => (route === href || route.startsWith(`${href}/`)) ? 'true' : 'false',
    [route],
  )

  const coreTools = tools.filter((tool) => ['comparer', 'analyzer', 'logs'].includes(tool.slug))

  return (
    <header className="navbar rcaNav">
      <div className="navInner rcaNavInner">
        <a className="brand rcaBrand" href="#/">
          <span className="brandBadge">RCA</span>
          <span className="brandText">
            <span className="brandTitle">SAP RCA Workspace</span>
            <span className="brandSub">Basis evidence console</span>
          </span>
        </a>

        <nav className="navQuick rcaToolTabs" aria-label="RCA tools">
          {coreTools.map((tool) => (
            <a
              key={tool.slug}
              href={`#/tool/${tool.slug}`}
              data-active={active(`/tool/${tool.slug}`)}
              onMouseEnter={() => preloadTool?.(tool.slug)}
            >
              <span>{tool.icon}</span>{tool.title}
            </a>
          ))}
        </nav>

        <nav className="navLinks rcaNavLinks" aria-label="Workspace navigation">
          <a href="#/" data-active={active('/')}>Dashboard</a>
          <a href="#/about" data-active={active('/about')}>Runbook</a>
          <a href="#/contact" data-active={active('/contact')}>Ops</a>
        </nav>

        <button className="btn iconBtn mobileBtn" type="button" onClick={() => setMobileOpen((value) => !value)} aria-label="Toggle menu">
          {mobileOpen ? '×' : '☰'}
        </button>

        {mobileOpen && (
          <div className="mobileNavDock">
            <div className="mobilePanel">
              <div className="mobilePanelTitle">SAP RCA Workspace</div>
              <div className="row wrap gap-10">
                <a className="btn" href="#/">Dashboard</a>
                {coreTools.map((tool) => (
                  <a className="btn" key={tool.slug} href={`#/tool/${tool.slug}`}>{tool.title}</a>
                ))}
                <a className="btn" href="#/about">Runbook</a>
                <a className="btn" href="#/contact">Ops</a>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
