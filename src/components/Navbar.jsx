import React from 'react'
import { tools, preloadTool } from '../tools'

export default function Navbar(){
  const [openTools, setOpenTools] = React.useState(false)
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [route, setRoute] = React.useState(() =>
    (typeof window !== 'undefined' ? (window.location.hash.replace('#','') || '/') : '/') || '/'
  )

  const active = React.useCallback(
    (href) => (route === href || route.startsWith(href + '/')) ? 'true' : 'false',
    [route],
  )

  React.useEffect(() => {
    const onHash = () => {
      setRoute(window.location.hash.replace('#','') || '/')
      setMobileOpen(false)
      setOpenTools(false)
    }
    const onDoc = (e) => {
      const el = e.target
      if (!(el instanceof Element)) return
      if (el.closest('.toolsMenuWrap')) return
      setOpenTools(false)
    }
    window.addEventListener('hashchange', onHash)
    document.addEventListener('click', onDoc)
    return () => {
      window.removeEventListener('hashchange', onHash)
      document.removeEventListener('click', onDoc)
    }
  }, [])

  const primaryTools = tools.filter(t => ['comparer', 'analyzer', 'logs'].includes(t.slug))

  const NavLinks = () => (
    <nav className="navLinks" aria-label="Primary navigation">
      <a href="#/" data-active={active('/')}>Command Center</a>

      <div className="toolsMenuWrap">
        <a
          href="#/tool/comparer"
          data-active={active('/tool')}
          onClick={(e) => { e.preventDefault(); setOpenTools(v => !v) }}
        >
          RCA Suite
        </a>

        {openTools && (
          <div className="toolsMenu" role="menu" aria-label="Tools menu">
            <div className="toolsMenuHeader">
              <span>SAP Intelligent RCA</span>
              <strong>{tools.length} modules</strong>
            </div>
            <div className="toolsGrid">
              {tools.map(t => (
                <a
                  key={t.slug}
                  className="toolItem"
                  href={`#/tool/${t.slug}`}
                  onMouseEnter={() => preloadTool?.(t.slug)}
                  role="menuitem"
                >
                  <div className="toolIcon">{t.icon}</div>
                  <div style={{minWidth:0}}>
                    <div className="toolMetaTitle">{t.title}</div>
                    <div className="toolMetaSub">{t.short}</div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      <a href="#/about" data-active={active('/about')}>Runbook</a>
      <a href="#/contact" data-active={active('/contact')}>Ops Contact</a>
    </nav>
  )

  return (
    <header className="navbar">
      <div className="navInner">
        <a className="brand" href="#/">
          <span className="brandBadge">SAP</span>
          <span className="brandText">
            <span className="brandTitle">SAP Intelligent RCA</span>
            <span className="brandSub">by Fikri Maulana · Basis Intelligence</span>
          </span>
        </a>

        <div className="navQuick">
          {primaryTools.map(t => (
            <a key={t.slug} href={`#/tool/${t.slug}`} onMouseEnter={() => preloadTool?.(t.slug)}>
              <span>{t.icon}</span>{t.title}
            </a>
          ))}
        </div>

        <button className="btn iconBtn mobileBtn" type="button" onClick={() => setMobileOpen(v => !v)} aria-label="Toggle menu">
          {mobileOpen ? '×' : '☰'}
        </button>

        {!mobileOpen && <NavLinks/>}

        {mobileOpen && (
          <div className="mobileNavDock">
            <div className="mobilePanel">
              <div className="mobilePanelTitle">SAP Intelligent RCA</div>
              <div className="row wrap gap-10">
                <a className="btn" href="#/" onClick={() => setMobileOpen(false)}>Command Center</a>
                <a className="btn" href="#/tool/comparer" onClick={() => setMobileOpen(false)}>Comparator</a>
                <a className="btn" href="#/tool/analyzer" onClick={() => setMobileOpen(false)}>ST03N</a>
                <a className="btn" href="#/tool/logs" onClick={() => setMobileOpen(false)}>Log Triage</a>
                <a className="btn" href="#/about" onClick={() => setMobileOpen(false)}>Runbook</a>
                <a className="btn" href="#/contact" onClick={() => setMobileOpen(false)}>Ops Contact</a>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
