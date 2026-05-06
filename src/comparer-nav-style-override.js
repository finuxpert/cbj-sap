// Safe CSS-only override for the old ToolComparer section shortcut overlay.
// No MutationObserver, no DOM scanning loop. It only re-appends a style tag
// after lazy CSS chunks load, so it wins CSS order without blocking React.

const CSS = `
  .cmpWrap .cmpSectionNav,
  .cmpWrap.cmpV2 .cmpSectionNav,
  .cmpWrap [class*="SectionNav"],
  .cmpWrap [class*="sectionNav"],
  .cmpWrap [class*="JumpNav"],
  .cmpWrap [class*="jumpNav"]{
    display:none!important;
    visibility:hidden!important;
    pointer-events:none!important;
    width:0!important;
    height:0!important;
    min-height:0!important;
    max-height:0!important;
    padding:0!important;
    margin:0!important;
    border:0!important;
    box-shadow:none!important;
    overflow:hidden!important;
  }
`

function applyComparerNavOverride() {
  if (typeof document === 'undefined') return
  const old = document.getElementById('cbj-comparer-nav-style-override')
  if (old) old.remove()
  const style = document.createElement('style')
  style.id = 'cbj-comparer-nav-style-override'
  style.textContent = CSS
  document.head.appendChild(style)
}

export function installComparerNavStyleOverride() {
  if (typeof window === 'undefined') return
  applyComparerNavOverride()
  window.addEventListener('hashchange', () => {
    setTimeout(applyComparerNavOverride, 80)
    setTimeout(applyComparerNavOverride, 300)
    setTimeout(applyComparerNavOverride, 900)
  })
  window.addEventListener('load', () => {
    setTimeout(applyComparerNavOverride, 120)
    setTimeout(applyComparerNavOverride, 600)
  })
  setTimeout(applyComparerNavOverride, 150)
  setTimeout(applyComparerNavOverride, 500)
  setTimeout(applyComparerNavOverride, 1200)
}

installComparerNavStyleOverride()
