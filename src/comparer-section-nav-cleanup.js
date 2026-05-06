// Runtime cleanup for the legacy comparer section shortcut overlay.
// ToolComparer is lazy-loaded, so its CSS can arrive after the app-level CSS.
// This file keeps the visual workspace clean by hiding that shortcut rail.

const LABELS = ['Snapshots', 'Offenders', 'Summary', 'Charts', 'Top WP', 'Top']

function isLegacySectionShortcut(element) {
  if (!element || !(element instanceof HTMLElement)) return false
  const text = (element.textContent || '').replace(/\s+/g, ' ').trim()
  if (!text) return false

  const matches = LABELS.filter((label) => text.includes(label)).length
  if (matches < 4) return false

  const rect = element.getBoundingClientRect()
  const className = String(element.className || '')
  return /cmpSectionNav|SectionNav|sectionNav|JumpNav|jumpNav/i.test(className) || (rect.width > 420 && rect.height > 120)
}

function applyHiddenState(element) {
  element.setAttribute('data-cbj-section-shortcut-hidden', 'true')
  element.style.setProperty('display', 'none', 'important')
  element.style.setProperty('visibility', 'hidden', 'important')
  element.style.setProperty('pointer-events', 'none', 'important')
  element.style.setProperty('width', '0', 'important')
  element.style.setProperty('height', '0', 'important')
  element.style.setProperty('min-height', '0', 'important')
  element.style.setProperty('max-height', '0', 'important')
  element.style.setProperty('padding', '0', 'important')
  element.style.setProperty('margin', '0', 'important')
  element.style.setProperty('border', '0', 'important')
  element.style.setProperty('box-shadow', 'none', 'important')
  element.style.setProperty('overflow', 'hidden', 'important')
}

function installStyle() {
  let style = document.getElementById('cbj-comparer-section-cleanup')
  if (!style) {
    style = document.createElement('style')
    style.id = 'cbj-comparer-section-cleanup'
    document.head.appendChild(style)
  }
  style.textContent = `
    .cmpSectionNav,
    .cmpWrap [class*="SectionNav"],
    .cmpWrap [class*="sectionNav"],
    .cmpWrap [class*="JumpNav"],
    .cmpWrap [class*="jumpNav"],
    [data-cbj-section-shortcut-hidden="true"]{
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
}

function cleanup() {
  if (!document.querySelector('.cmpWrap')) return
  installStyle()
  const candidates = document.querySelectorAll('.cmpSectionNav, [class*="SectionNav"], [class*="sectionNav"], [class*="JumpNav"], [class*="jumpNav"], .cmpWrap div, .cmpWrap nav, .cmpWrap aside')
  candidates.forEach((element) => {
    if (isLegacySectionShortcut(element)) applyHiddenState(element)
  })
}

export function installComparerSectionNavCleanup() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  installStyle()
  cleanup()

  const run = () => cleanup()
  window.addEventListener('hashchange', () => setTimeout(run, 100))
  window.addEventListener('load', () => setTimeout(run, 150))

  const observer = new MutationObserver(run)
  observer.observe(document.documentElement, { childList: true, subtree: true })

  setTimeout(run, 250)
  setTimeout(run, 700)
  setTimeout(run, 1500)
}

installComparerSectionNavCleanup()
