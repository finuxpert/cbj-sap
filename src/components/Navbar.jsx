import React from 'react'
import { getCurrentHashRoute } from '../app/routeUtils.js'
import { APP_BUILD_LABEL, APP_DISPLAY_VERSION, APP_NAME, APP_PREVIOUS_VERSION, APP_TAGLINE, APP_VERSION } from '../app/version.js'
import { tools, preloadTool } from '../tools'
import SphereLogo from './SphereLogo.jsx'

const MOBILE_TOOL_LABELS = {
  analyzer: 'ST03N',
  logs: 'LOG',
}

const MOBILE_TOOL_SUB = {
  analyzer: 'Workload',
  logs: 'Resources',
}

function canAnimateNavigation(event) {
  if (event.defaultPrevented || event.button !== 0) return false
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false
  return typeof document.startViewTransition === 'function'
}

function navigateWorkspace(event, href, slug) {
  preloadTool?.(slug)
  if (!canAnimateNavigation(event)) return
  event.preventDefault()
  document.startViewTransition(() => {
    window.location.hash = href
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
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
      <header className="navbar sphereNav">
        <div className="navInner sphereNavInner">
          <a className="brand sphereBrand" href="#/st03n" aria-label={`${APP_NAME} ${APP_DISPLAY_VERSION} ST03N analysis`}>
            <SphereLogo />
            <span className="brandText">
              <span className="brandTitle">{APP_TAGLINE}</span>
              <span className="brandSub" title={`Previous release: v${APP_PREVIOUS_VERSION}`}>{APP_BUILD_LABEL}</span>
            </span>
          </a>

          <nav className="navQuick sphereToolTabs" aria-label={`${APP_NAME} SAP analysis workspaces`}>
            {tools.map((tool) => {
              const href = `/tool/${tool.slug}`
              const active = isActive(href)
              return (
                <a
                  key={tool.slug}
                  href={`#${href}`}
                  data-active={active ? 'true' : 'false'}
                  aria-current={active ? 'page' : undefined}
                  onClick={(event) => navigateWorkspace(event, href, tool.slug)}
                  onMouseEnter={() => preloadTool?.(tool.slug)}
                  onFocus={() => preloadTool?.(tool.slug)}
                >
                  {tool.title}
                </a>
              )
            })}
          </nav>

          <span className="mobileVersionBadge" aria-label={`Version ${APP_VERSION}`} title={APP_BUILD_LABEL}>v{APP_VERSION}</span>
        </div>
      </header>

      <nav className="mobileAnalysisNav" aria-label={`Mobile ${APP_NAME} SAP analysis navigation`}>
        {tools.map((tool) => {
          const href = `/tool/${tool.slug}`
          const active = isActive(href)
          return (
            <a
              key={tool.slug}
              href={`#${href}`}
              data-active={active ? 'true' : 'false'}
              aria-current={active ? 'page' : undefined}
              onClick={(event) => navigateWorkspace(event, href, tool.slug)}
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
