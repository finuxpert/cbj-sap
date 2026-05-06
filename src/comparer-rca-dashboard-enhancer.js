// CBJ SAP RCA Comparator Dashboard Enhancer
// Safe runtime enhancer: no MutationObserver, no long DOM loop.
// It improves RCA Comparator UX by adding a compact visual dashboard and hiding
// the old mobile section jump dock when it is rendered without stable classes.

const ENHANCER_ID = 'cbj-rca-dashboard-enhancer'
const STYLE_ID = 'cbj-rca-dashboard-enhancer-style'
const NAV_RE = /Snapshots\s*\d*\s*Offenders\s*\d*\s*Summary\s*\d*\s*Charts\s*\d*\s*Top\s*WP\s*\d*\s*Top/i

function num(v) {
  const n = parseFloat(String(v || '').replace(',', '.').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function short(text, max = 42) {
  const s = String(text || '').replace(/\s+/g, ' ').trim()
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

function ageHours(age) {
  const s = String(age || '')
  const d = num(s.match(/(\d+)\s*d/i)?.[1])
  const h = num(s.match(/(\d+)\s*h/i)?.[1])
  const m = num(s.match(/(\d+)\s*m/i)?.[1])
  return d * 24 + h + m / 60
}

function statusClass(v) {
  const n = num(v)
  if (n >= 60) return 'crit'
  if (n >= 35) return 'warn'
  return 'ok'
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .cbjRcaDash{margin:10px 0 14px;border:1px solid rgba(45,212,191,.20);border-radius:18px;background:linear-gradient(180deg,rgba(11,43,39,.92),rgba(5,15,14,.96));box-shadow:0 18px 46px rgba(0,0,0,.28);overflow:hidden;color:#f6fffc}
    .cbjRcaDashTop{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid rgba(203,244,238,.12);background:radial-gradient(circle at top left,rgba(45,212,191,.18),transparent 38%)}
    .cbjRcaDashTitle{display:flex;flex-direction:column;gap:3px;min-width:0}.cbjRcaDashTitle strong{font-size:14px;font-weight:1000;letter-spacing:-.02em}.cbjRcaDashTitle span{font-size:11px;color:rgba(222,241,238,.65);line-height:1.35}
    .cbjRcaBadge{flex:0 0 auto;border-radius:999px;padding:6px 10px;font-size:10px;font-weight:1000;border:1px solid rgba(45,212,191,.30);background:rgba(45,212,191,.10);color:#dffdf7}.cbjRcaBadge.warn{border-color:rgba(251,191,36,.42);background:rgba(251,191,36,.14);color:#fff1c2}.cbjRcaBadge.crit{border-color:rgba(251,113,133,.46);background:rgba(251,113,133,.14);color:#ffe1e7}
    .cbjRcaDashBody{padding:14px 16px}.cbjRcaCauseCard{display:grid;grid-template-columns:minmax(0,1fr) 190px;gap:12px;align-items:stretch;margin-bottom:12px}.cbjRcaCause{padding:12px 13px;border-radius:14px;border:1px solid rgba(45,212,191,.18);background:rgba(0,0,0,.18);font-size:12px;line-height:1.5;font-weight:900}.cbjRcaScore{border-radius:14px;border:1px solid rgba(203,244,238,.12);background:rgba(255,255,255,.035);padding:11px 12px;display:flex;flex-direction:column;justify-content:center;gap:4px}.cbjRcaScore b{font-size:26px;line-height:1;font-weight:1000}.cbjRcaScore span{font-size:10px;color:rgba(222,241,238,.58);font-weight:900;text-transform:uppercase;letter-spacing:.06em}
    .cbjRcaMetricGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-bottom:12px}.cbjRcaMetric{min-width:0;border:1px solid rgba(203,244,238,.11);background:rgba(255,255,255,.032);border-radius:14px;padding:10px 11px}.cbjRcaMetric span{display:block;font-size:9.5px;color:rgba(222,241,238,.55);text-transform:uppercase;letter-spacing:.07em;font-weight:950}.cbjRcaMetric b{display:block;margin-top:5px;font-size:15px;font-weight:1000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cbjRcaMetric small{display:block;margin-top:3px;font-size:10px;color:rgba(222,241,238,.55);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .cbjRcaChartGrid{display:grid;grid-template-columns:1.1fr .9fr;gap:10px}.cbjRcaPanel{min-width:0;border:1px solid rgba(203,244,238,.11);background:rgba(0,0,0,.14);border-radius:16px;padding:12px}.cbjRcaPanelHead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px}.cbjRcaPanelHead b{font-size:11px;font-weight:1000}.cbjRcaPanelHead span{font-size:9.5px;color:rgba(222,241,238,.55);font-weight:850}.cbjRcaBars{display:flex;flex-direction:column;gap:7px}.cbjRcaBar{display:grid;grid-template-columns:100px minmax(0,1fr) 44px;align-items:center;gap:8px;font-size:10px;color:rgba(239,255,252,.82)}.cbjRcaBarLabel{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cbjRcaBarTrack{height:9px;border-radius:999px;background:rgba(255,255,255,.07);overflow:hidden}.cbjRcaBarFill{height:100%;border-radius:999px;background:linear-gradient(90deg,#2dd4bf,#38bdf8)}.cbjRcaBarFill.warn{background:linear-gradient(90deg,#f59e0b,#facc15)}.cbjRcaBarFill.crit{background:linear-gradient(90deg,#fb7185,#f97316)}.cbjRcaBarVal{text-align:right;color:rgba(239,255,252,.75);font-weight:900}
    .cbjRcaSpark{height:150px;width:100%;display:block}.cbjRcaSvgText{fill:rgba(222,241,238,.62);font-size:10px;font-weight:800}.cbjRcaLine{fill:none;stroke:#2dd4bf;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.cbjRcaArea{fill:rgba(45,212,191,.10)}.cbjRcaDot{fill:#2dd4bf;stroke:#ecfeff;stroke-width:1.4}.cbjRcaActionList{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}.cbjRcaAction{border:1px solid rgba(45,212,191,.14);background:rgba(45,212,191,.055);border-radius:12px;padding:9px 10px;font-size:10.8px;line-height:1.38;color:rgba(239,255,252,.78)}.cbjRcaAction b{color:#f6fffc}
    .cbjHideOldJumpNav{display:none!important;visibility:hidden!important;pointer-events:none!important;width:0!important;height:0!important;max-height:0!important;overflow:hidden!important;padding:0!important;margin:0!important;border:0!important;box-shadow:none!important;opacity:0!important}
    @media(max-width:760px){.cbjRcaDash{margin:8px 0 10px;border-radius:16px}.cbjRcaDashTop{padding:12px}.cbjRcaDashBody{padding:12px}.cbjRcaCauseCard{grid-template-columns:1fr}.cbjRcaMetricGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.cbjRcaChartGrid{grid-template-columns:1fr}.cbjRcaActionList{grid-template-columns:1fr}.cbjRcaBar{grid-template-columns:84px minmax(0,1fr) 38px}.cbjRcaSpark{height:128px}.appShell.isTool .sapPdfDock{left:10px!important;right:10px!important;bottom:10px!important;border-radius:18px!important;background:rgba(3,12,13,.96)!important}.appShell.isTool .sapPdfDock span{display:none!important}.appShell.isTool main{padding-bottom:74px!important}}
  `
  document.head.appendChild(style)
}

function readKpis(root) {
  const text = (root.textContent || '').replace(/\s+/g, ' ')
  const get = (label, fallback = 0) => {
    const re = new RegExp(`${label}\\s*([0-9]+(?:[.,][0-9]+)?)`, 'i')
    return num(text.match(re)?.[1] || fallback)
  }
  return {
    snapshots: get('Snapshots'),
    bad: get('Bad'),
    severity: get('Highest Sev') || get('Severity'),
    offenders: get('Offenders'),
    cpu: get('CPU'),
    mem: get('Mem'),
    swap: get('Swap si/so'),
    rss: get('Max RSS'),
    ageText: text.match(/Max Age\s*([0-9dhm\s]+)/i)?.[1]?.trim() || '',
  }
}

function readRows(root) {
  const rows = []
  root.querySelectorAll('tbody tr, .cmpVtRow').forEach((tr) => {
    const cells = Array.from(tr.querySelectorAll('td,th,span,div')).map(x => x.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean)
    const line = cells.join(' | ')
    if (/AOPH\w+PAPPDC/i.test(line) && /(CRIT|WARN|OK)/i.test(line)) rows.push({ cells, line })
  })
  return rows.slice(0, 300)
}

function derive(rows, kpis) {
  const hosts = new Map()
  const jobs = new Map()
  const ages = []
  const rssRows = []
  for (const row of rows) {
    const line = row.line
    const host = line.match(/\b(AOPH\w+PAPPDC)\b/i)?.[1] || 'UNKNOWN'
    const status = line.match(/\b(CRIT|WARN|OK)\b/i)?.[1] || 'OK'
    const age = line.match(/\b(\d+d\d+h|\d+d|\d+h\d+m|\d+h|\d+m)\b/i)?.[1] || ''
    const rssCandidate = row.cells.map(num).filter(n => n > 0 && n < 200).sort((a, b) => b - a)[0] || 0
    const job = line.match(/\b([A-Z][A-Z0-9_]{5,})\b(?!.*\b[A-Z][A-Z0-9_]{5,}\b)/)?.[1] || '?'
    const weight = status === 'CRIT' ? 4 : status === 'WARN' ? 2 : 1
    hosts.set(host, (hosts.get(host) || 0) + weight)
    if (job !== 'UNKNOWN') jobs.set(job, (jobs.get(job) || 0) + weight)
    if (age) ages.push({ label: `${host} ${short(job, 18)}`, value: ageHours(age), raw: age, status })
    if (rssCandidate) rssRows.push({ label: `${host} ${short(job, 18)}`, value: rssCandidate, status })
  }
  const topHosts = Array.from(hosts, ([label, value]) => ({ label, value })).sort((a,b) => b.value - a.value).slice(0, 6)
  const topJobs = Array.from(jobs, ([label, value]) => ({ label, value })).sort((a,b) => b.value - a.value).slice(0, 6)
  const topAges = ages.sort((a,b) => b.value - a.value).slice(0, 6)
  const topRss = rssRows.sort((a,b) => b.value - a.value).slice(0, 6)
  const host = topHosts[0]?.label || 'UNKNOWN'
  const job = topJobs[0]?.label || 'UNKNOWN'
  const risk = statusClass(kpis.severity)
  let cause = `Suspected issue: repeated SAP work process offender on ${host}, main job ${job}. Severity ${kpis.severity || 0}, offenders ${kpis.offenders || rows.length}.`
  if (topAges[0]?.value >= 72) cause = `Suspected issue: long-running work process on ${host}. Top runtime ${topAges[0].raw}, recurring job ${job}.`
  if (kpis.rss >= 10) cause = `Suspected issue: high RSS / long-running WP on ${host}. Max RSS ${kpis.rss}GB, runtime ${kpis.ageText || topAges[0]?.raw || '-'}, main job ${job}.`
  if (kpis.swap > 0) cause += ` Swap paging detected (${kpis.swap}), validate OS memory pressure.`
  return { topHosts, topJobs, topAges, topRss, host, job, risk, cause }
}

function bars(items, kind = 'ok') {
  const max = Math.max(1, ...items.map(x => x.value || 0))
  if (!items.length) return '<div class="cbjRcaAction">Upload/parse evidence first to generate ranking.</div>'
  return `<div class="cbjRcaBars">${items.map((x) => {
    const cls = kind === 'age' && x.value >= 72 ? 'crit' : kind === 'rss' && x.value >= 10 ? 'crit' : kind === 'host' ? 'warn' : ''
    return `<div class="cbjRcaBar"><div class="cbjRcaBarLabel" title="${x.label}">${short(x.label, 24)}</div><div class="cbjRcaBarTrack"><div class="cbjRcaBarFill ${cls}" style="width:${Math.max(6, Math.min(100, (x.value / max) * 100))}%"></div></div><div class="cbjRcaBarVal">${kind === 'age' ? Math.round(x.value / 24) + 'd' : kind === 'rss' ? x.value.toFixed(1) : Math.round(x.value)}</div></div>`
  }).join('')}</div>`
}

function spark(kpis) {
  const vals = [kpis.cpu || 0, kpis.mem || 0, kpis.swap ? 35 : 0, kpis.rss ? Math.min(100, kpis.rss * 6) : 0, kpis.severity || 0]
  const w = 420, h = 150, pad = 24
  const pts = vals.map((v, i) => {
    const x = pad + i * ((w - pad * 2) / Math.max(1, vals.length - 1))
    const y = h - pad - (Math.max(0, Math.min(100, v)) / 100) * (h - pad * 2)
    return [x, y]
  })
  const line = pts.map(p => p.join(',')).join(' ')
  const area = `${pad},${h-pad} ${line} ${w-pad},${h-pad}`
  return `<svg class="cbjRcaSpark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline class="cbjRcaArea" points="${area}"></polyline><polyline class="cbjRcaLine" points="${line}"></polyline>${pts.map((p,i)=>`<circle class="cbjRcaDot" cx="${p[0]}" cy="${p[1]}" r="4"></circle>`).join('')}<text class="cbjRcaSvgText" x="${pad}" y="${h-6}">CPU</text><text class="cbjRcaSvgText" x="${w*.31}" y="${h-6}">MEM</text><text class="cbjRcaSvgText" x="${w*.51}" y="${h-6}">SWAP</text><text class="cbjRcaSvgText" x="${w*.70}" y="${h-6}">RSS</text><text class="cbjRcaSvgText" x="${w-60}" y="${h-6}">SEV</text></svg>`
}

function hideOldJumpNav(root) {
  const candidates = Array.from(root.querySelectorAll('nav, aside, div, section'))
    .filter((el) => {
      const txt = (el.textContent || '').replace(/\s+/g, ' ').trim()
      if (!NAV_RE.test(txt)) return false
      const r = el.getBoundingClientRect()
      if (r.height > 260 || r.width < 80) return false
      if (el.closest(`#${ENHANCER_ID}`)) return false
      return true
    })
    .sort((a, b) => (a.getBoundingClientRect().height * a.getBoundingClientRect().width) - (b.getBoundingClientRect().height * b.getBoundingClientRect().width))
  if (candidates[0]) candidates[0].classList.add('cbjHideOldJumpNav')
}

function renderDashboard() {
  if (!location.hash.includes('/tool/comparer')) return
  injectStyle()
  const root = document.querySelector('.cmpWrap') || document.querySelector('.fullBleed')
  if (!root) return
  hideOldJumpNav(root)
  const kpis = readKpis(root)
  const rows = readRows(root)
  const d = derive(rows, kpis)
  let dash = document.getElementById(ENHANCER_ID)
  if (!dash) {
    dash = document.createElement('section')
    dash.id = ENHANCER_ID
    dash.className = 'cbjRcaDash'
    const topbar = root.querySelector('.cmpTopbar')
    if (topbar?.parentNode) topbar.insertAdjacentElement('afterend', dash)
    else root.prepend(dash)
  }
  dash.innerHTML = `
    <div class="cbjRcaDashTop">
      <div class="cbjRcaDashTitle"><strong>RCA Executive Dashboard</strong><span>Auto summary from visible WP-SCOUT evidence. Charts first, tables only for drill-down.</span></div>
      <div class="cbjRcaBadge ${d.risk}">${d.risk.toUpperCase()} RISK</div>
    </div>
    <div class="cbjRcaDashBody">
      <div class="cbjRcaCauseCard"><div class="cbjRcaCause">${d.cause}</div><div class="cbjRcaScore"><span>Severity score</span><b>${kpis.severity || 0}</b><span>${kpis.offenders || rows.length} offender rows</span></div></div>
      <div class="cbjRcaMetricGrid">
        <div class="cbjRcaMetric"><span>Affected host</span><b>${d.host}</b><small>highest weighted offender</small></div>
        <div class="cbjRcaMetric"><span>Main job</span><b title="${d.job}">${short(d.job, 28)}</b><small>most repeated pattern</small></div>
        <div class="cbjRcaMetric"><span>Max RSS</span><b>${kpis.rss || 0} GB</b><small>memory pressure indicator</small></div>
        <div class="cbjRcaMetric"><span>Max age</span><b>${kpis.ageText || d.topAges[0]?.raw || '-'}</b><small>long-running WP</small></div>
      </div>
      <div class="cbjRcaChartGrid">
        <div class="cbjRcaPanel"><div class="cbjRcaPanelHead"><b>Health trend shape</b><span>CPU / MEM / SWAP / RSS / SEV</span></div>${spark(kpis)}</div>
        <div class="cbjRcaPanel"><div class="cbjRcaPanelHead"><b>Top hosts by offender weight</b><span>CRIT weighted</span></div>${bars(d.topHosts, 'host')}</div>
        <div class="cbjRcaPanel"><div class="cbjRcaPanelHead"><b>High RSS ranking</b><span>GB</span></div>${bars(d.topRss, 'rss')}</div>
        <div class="cbjRcaPanel"><div class="cbjRcaPanelHead"><b>Long-running WP ranking</b><span>runtime days</span></div>${bars(d.topAges, 'age')}</div>
      </div>
      <div class="cbjRcaActionList">
        <div class="cbjRcaAction"><b>Recommended action 1:</b> Check SM50/SM66 on ${d.host}; validate PID/job owner and whether runtime is expected.</div>
        <div class="cbjRcaAction"><b>Recommended action 2:</b> Correlate ${short(d.job, 32)} with SM37, ST22, SM21, and ST03N workload if response-time symptom exists.</div>
        <div class="cbjRcaAction"><b>Recommended action 3:</b> If swap/RSS is high, validate OS memory, zombie WP, heap usage, and recent batch/window changes.</div>
        <div class="cbjRcaAction"><b>Management note:</b> Use PDF export after selecting the worst snapshot so report reflects the active evidence.</div>
      </div>
    </div>
  `
}

function scheduleRender() {
  const delays = [50, 250, 700, 1500, 3000]
  delays.forEach((d) => window.setTimeout(renderDashboard, d))
}

export function installComparerRcaDashboardEnhancer() {
  if (typeof window === 'undefined') return
  scheduleRender()
  window.addEventListener('hashchange', scheduleRender)
  window.addEventListener('load', scheduleRender)
  window.addEventListener('click', () => window.setTimeout(renderDashboard, 250), true)
  window.addEventListener('change', () => window.setTimeout(renderDashboard, 350), true)
  window.addEventListener('drop', () => scheduleRender(), true)
}

installComparerRcaDashboardEnhancer()
