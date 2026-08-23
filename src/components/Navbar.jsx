import React from 'react'
import { createPortal } from 'react-dom'
import { getCurrentHashRoute } from '../app/routeUtils.js'
import { APP_VERSION } from '../app/version.js'
import { tools, preloadTool } from '../tools'
import SapRcaLogo from './SapRcaLogo.jsx'

const MOBILE_TOOL_LABELS = {
  comparer: 'WP-SCOUT',
  analyzer: 'ST03N Impact',
  logs: 'Log Evidence',
}

const mobileStyles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 2147483647,
    display: 'block',
    width: '100vw',
    height: '100dvh',
    padding: '72px 12px 16px',
    overflowY: 'auto',
    background: '#02080a',
  },
  panel: {
    display: 'block',
    width: '100%',
    maxWidth: 520,
    margin: '0 auto',
    padding: 14,
    border: '1px solid rgba(45, 212, 191, 0.44)',
    borderRadius: 22,
    background: '#071013',
    color: 'rgba(250, 255, 253, 0.98)',
    boxShadow: '0 28px 90px rgba(0, 0, 0, 0.78)',
  },
  head: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  title: {
    marginBottom: 4,
    color: 'rgba(45, 212, 191, 0.98)',
    fontSize: 12,
    fontWeight: 950,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  sub: {
    margin: 0,
    color: 'rgba(220, 238, 238, 0.76)',
    fontSize: 12,
  },
  close: {
    width: 42,
    height: 42,
    flex: '0 0 42px',
    border: '1px solid rgba(214, 242, 240, 0.18)',
    borderRadius: 14,
    background: 'rgba(255, 255, 255, 0.07)',
    color: 'rgba(250, 255, 253, 0.98)',
    fontSize: 26,
    lineHeight: 1,
  },
  group: {
    display: 'grid',
    gap: 10,
  },
  item: {
    display: 'block',
    padding: '13px 14px',
    border: '1px solid rgba(214, 242, 240, 0.14)',
    borderRadius: 16,
    background: 'rgba(255, 255, 255, 0.055)',
    color: 'rgba(250, 255, 253, 0.98)',
    textDecoration: 'none',
  },
  itemActive: {
    border: '1px solid rgba(45, 212, 191, 0.48)',
    background: 'linear-gradient(135deg, rgba(45, 212, 191, 0.20), rgba(56, 189, 248, 0.10))',
  },
  itemTitle: {
    display: 'block',
    marginBottom: 4,
    color: 'rgba(250, 255, 253, 1)',
    fontSize: 14,
    fontWeight: 900,
  },
  itemSub: {
    display: 'block',
    color: 'rgba(220, 238, 238, 0.76)',
    fontSize: 12,
    lineHeight: 1.4,
  },
  footer: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
    marginTop: 14,
  },
  footerLink: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
    border: '1px solid rgba(214, 242, 240, 0.14)',
    borderRadius: 14,
    background: 'rgba(255, 255, 255, 0.055)',
    color: 'rgba(250, 255, 253, 0.98)',
    fontSize: 13,
    fontWeight: 850,
    textDecoration: 'none',
  },
}

function mobileItemStyle(isActive) {
  return isActive ? { ...mobileStyles.item, ...mobileStyles.itemActive } : mobileStyles.item
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

  React.useEffect(() => {
    if (!mobileOpen) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [mobileOpen])

  const active = React.useCallback(
    (href) => (route === href || route.startsWith(`${href}/`)) ? 'true' : 'false',
    [route],
  )
  const isActive = React.useCallback(
    (href) => route === href || route.startsWith(`${href}/`),
    [route],
  )

  const closeMobile = React.useCallback(() => setMobileOpen(false), [])
  const coreTools = tools.filter((tool) => ['comparer', 'analyzer', 'logs'].includes(tool.slug))

  const mobileMenu = mobileOpen ? createPortal(
    <div style={mobileStyles.overlay} role="dialog" aria-label="Mobile navigation menu">
      <div style={mobileStyles.panel}>
        <div style={mobileStyles.head}>
          <div>
            <div style={mobileStyles.title}>SAP RCA Workspace · v{APP_VERSION}</div>
            <p style={mobileStyles.sub}>Quick access RCA tools</p>
          </div>
          <button style={mobileStyles.close} type="button" onClick={closeMobile} aria-label="Close menu">×</button>
        </div>

        <div style={mobileStyles.group}>
          <a style={mobileItemStyle(isActive('/'))} href="#/" onClick={closeMobile}>
            <strong style={mobileStyles.itemTitle}>Dashboard</strong>
            <span style={mobileStyles.itemSub}>Upload evidence pack & incident workflow</span>
          </a>
          <a style={mobileItemStyle(isActive('/cases'))} href="#/cases" onClick={closeMobile}>
            <strong style={mobileStyles.itemTitle}>Case History</strong>
            <span style={mobileStyles.itemSub}>Mobile RCA summary, anomaly, status, and evidence count</span>
          </a>
          {coreTools.map((tool) => (
            <a
              style={mobileItemStyle(isActive(`/tool/${tool.slug}`))}
              key={tool.slug}
              href={`#/tool/${tool.slug}`}
              onMouseEnter={() => preloadTool?.(tool.slug)}
              onClick={closeMobile}
            >
              <strong style={mobileStyles.itemTitle}>{MOBILE_TOOL_LABELS[tool.slug] || tool.title}</strong>
              <span style={mobileStyles.itemSub}>{tool.short}</span>
            </a>
          ))}
        </div>

        <div style={mobileStyles.footer}>
          <a style={mobileStyles.footerLink} href="#/about" onClick={closeMobile}>Runbook</a>
          <a style={mobileStyles.footerLink} href="#/contact" onClick={closeMobile}>Ops</a>
        </div>
      </div>
    </div>,
    document.body,
  ) : null

  return (
    <>
      <header className="navbar rcaNav">
        <div className="navInner rcaNavInner">
          <a className="brand rcaBrand" href="#/" onClick={closeMobile} aria-label={`SAP RCA Workspace v${APP_VERSION} home`}>
            <SapRcaLogo />
            <span className="brandText">
              <span className="brandTitle">SAP RCA Workspace</span>
              <span className="brandSub">Basis evidence console · v{APP_VERSION}</span>
            </span>
          </a>

          <nav className="navQuick rcaToolTabs" aria-label="RCA tools">
            {coreTools.map((tool) => (
              <a
                key={tool.slug}
                href={`#/tool/${tool.slug}`}
                data-active={active(`/tool/${tool.slug}`)}
                aria-current={active(`/tool/${tool.slug}`) === 'true' ? 'page' : undefined}
                onMouseEnter={() => preloadTool?.(tool.slug)}
              >
                <span>{tool.icon}</span>{tool.title}
              </a>
            ))}
          </nav>

          <nav className="navLinks rcaNavLinks" aria-label="Workspace navigation">
            <a href="#/" data-active={active('/')} aria-current={active('/') === 'true' ? 'page' : undefined}>Dashboard</a>
            <a href="#/cases" data-active={active('/cases')} aria-current={active('/cases') === 'true' ? 'page' : undefined}>Cases</a>
            <a href="#/about" data-active={active('/about')} aria-current={active('/about') === 'true' ? 'page' : undefined}>Runbook</a>
            <a href="#/contact" data-active={active('/contact')} aria-current={active('/contact') === 'true' ? 'page' : undefined}>Ops</a>
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
        </div>
      </header>
      {mobileMenu}
    </>
  )
}
