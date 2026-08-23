import React from 'react'
import { getCurrentHashRoute } from '../app/routeUtils.js'
import { APP_VERSION } from '../app/version.js'
import { tools, preloadTool } from '../tools'
import SapRcaLogo from './SapRcaLogo.jsx'

const MOBILE_TOOL_LABELS = {
  analyzer: 'ST03N',
  logs: 'LOG',
}

const MOBILE_TOOL_SUB = {
  analyzer: 'Workload',
  logs: 'Resources',
}

export default function Navbar() {
  const [route, setRoute] = React.useState(getCurrentHashRoute)

  React.useEffect(() => {
    const onHash = () => setRoute(getCurrentHashRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const isActive = React.useCallback(
    (href) => route === href || route.startsWith(`${href}/`),
    [route],
  )

  return (
    <>
      <header className="navbar rcaNav">
        <div className="navInner rcaNavInner">
          <a className="brand rcaBrand" href="#/st03n" aria-label={`SAP RCA Workspace v${APP_VERSION} ST03N analysis`}>
            <SapRcaLogo />
            <span className="brandText">
              <span className="brandTitle">SAP RCA Workspace</span>
              <span className="brandSub">Operational analysis · v{APP_VERSION}</span>
            </span>
          </a>

          <nav className="navQuick rcaToolTabs" aria-label="SAP analysis workspaces">
            {tools.map((tool) => {
              const href = `/tool/${tool.slug}`
              const active = isActive(href)
              return (
                <a
                  key={tool.slug}
                  href={`#${href}`}
                  data-active={active ? 'true' : 'false'}
                  aria-current={active ? 'page' : undefined}
                  onMouseEnter={() => preloadTool?.(tool.slug)}
                  onFocus={() => preloadTool?.(tool.slug)}
                >
                  {tool.title}
                </a>
              )
            })}
          </nav>

          <span className="mobileVersionBadge" aria-label={`Version ${APP_VERSION}`}>v{APP_VERSION}</span>
        </div>
      </header>

      <nav className="mobileAnalysisNav" aria-label="Mobile SAP analysis navigation">
        {tools.map((tool) => {
          const href = `/tool/${tool.slug}`
          const active = isActive(href)
          return (
            <a
              key={tool.slug}
              href={`#${href}`}
              data-active={active ? 'true' : 'false'}
              aria-current={active ? 'page' : undefined}
              onTouchStart={() => preloadTool?.(tool.slug)}
              onFocus={() => preloadTool?.(tool.slug)}
            >
              <strong>{MOBILE_TOOL_LABELS[tool.slug] || tool.title}</strong>
              <small>{MOBILE_TOOL_SUB[tool.slug] || tool.short}</small>
            </a>
          )
        })}
      </nav>
    </>
  )
}
