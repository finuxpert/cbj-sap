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

  const NavLinks = () => (
    <nav className="navLinks" aria-label="Primary navigation">
      <a href="#/" data-active={active('/')}>Home</a>

      <div className="toolsMenuWrap">
        <a
          href="#/tool/comparer"
          data-active={active('/tool')}
          onClick={(e) => { e.preventDefault(); setOpenTools(v => !v) }}
        >
          Tools
        </a>

        {openTools && (
          <div className="toolsMenu" role="menu" aria-label="Tools menu">
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

      <a href="#/about" data-active={active('/about')}>About</a>
      <a href="#/contact" data-active={active('/contact')}>Contact</a>
    </nav>
  )

  return (
    <header className="navbar">
      <div className="navInner">
        <a className="brand" href="#/">
          <span className="brandBadge">SAP</span>
          <span>
            <span className="brandTitle">SAP Tools</span>
            <span className="brandSub">Basis Ops</span>
          </span>
        </a>

        <button className="btn iconBtn mobileBtn" type="button" onClick={() => setMobileOpen(v => !v)} aria-label="Toggle menu">
          {mobileOpen ? '×' : '☰'}
        </button>

        {!mobileOpen && <NavLinks/>}

        {mobileOpen && (
          <div style={{width:'100%'}}>
            <div className="mobilePanel">
              <div className="row wrap gap-10">
                <a className="btn" href="#/" onClick={() => setMobileOpen(false)}>Home</a>
                <a className="btn" href="#/tool/comparer" onClick={() => setMobileOpen(false)}>Tools</a>
                <a className="btn" href="#/about" onClick={() => setMobileOpen(false)}>About</a>
                <a className="btn" href="#/contact" onClick={() => setMobileOpen(false)}>Contact</a>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
