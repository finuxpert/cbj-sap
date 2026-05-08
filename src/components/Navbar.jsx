import React from 'react'
import { getCurrentHashRoute } from '../app/routeUtils.js'
import { tools, preloadTool } from '../tools'
import SapRcaLogo from './SapRcaLogo.jsx'

const MOBILE_TOOL_LABELS = {
  comparer: 'WP-SCOUT',
  analyzer: 'ST03N Impact',
  logs: 'Log Evidence',
}

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

  const closeMobile = React.useCallback(() => setMobileOpen(false), [])
  const coreTools = tools.filter((tool) => ['comparer', 'analyzer', 'logs'].includes(tool.slug))

  return (
    <header className="navbar rcaNav">
      <div className="navInner rcaNavInner">
        <a className="brand rcaBrand" href="#/" onClick={closeMobile}>
          <SapRcaLogo />
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
          <a href="#/cases" data-active={active('/cases')}>Cases</a>
          <a href="#/about" data-active={active('/about')}>Runbook</a>
          <a href="#/contact" data-active={active('/contact')}>Ops</a>
        </nav>

        <button
          className="btn iconBtn mobileBtn rcaMobileToggle"
          type="button"
          onClick={() => setMobileOpen((value) => !value)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen ? 'true' : 'false'}
        >
          {mobileOpen ? '×' : '☰'}
        </button>

        {mobileOpen && (
          <div className="mobileNavDock rcaMobileMenu" role="dialog" aria-label="Mobile navigation menu">
            <div className="mobilePanel">
              <div className="mobilePanelHead">
                <div>
                  <div className="mobilePanelTitle">SAP RCA Workspace</div>
                  <p>Quick access RCA tools</p>
                </div>
                <button className="mobilePanelClose" type="button" onClick={closeMobile} aria-label="Close menu">×</button>
              </div>

              <div className="mobileMenuGroup">
                <a className="mobileMenuItem" href="#/" data-active={active('/')} onClick={closeMobile}>
                  <strong>Dashboard</strong>
                  <span>Upload evidence pack & incident workflow</span>
                </a>
                <a className="mobileMenuItem" href="#/cases" data-active={active('/cases')} onClick={closeMobile}>
                  <strong>Case History</strong>
                  <span>Mobile RCA summary, anomaly, status, and evidence count</span>
                </a>
                {coreTools.map((tool) => (
                  <a
                    className="mobileMenuItem"
                    key={tool.slug}
                    href={`#/tool/${tool.slug}`}
                    data-active={active(`/tool/${tool.slug}`)}
                    onMouseEnter={() => preloadTool?.(tool.slug)}
                    onClick={closeMobile}
                  >
                    <strong>{MOBILE_TOOL_LABELS[tool.slug] || tool.title}</strong>
                    <span>{tool.short}</span>
                  </a>
                ))}
              </div>

              <div className="mobileMenuFooter">
                <a href="#/about" data-active={active('/about')} onClick={closeMobile}>Runbook</a>
                <a href="#/contact" data-active={active('/contact')} onClick={closeMobile}>Ops</a>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
