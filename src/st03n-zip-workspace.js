import JSZip from 'jszip'

const INSTALLED = '__cbjSt03nZipWorkspaceInstalled'
const PACK_PREFIX = 'st03n_pack_v1_'
const ACCEPT = '.zip,.xlsx,.xls,.csv'

function classify(name) {
  const n = String(name || '').toLowerCase()
  if (/time|hour|profile.*time|time.*profile/.test(n)) return 'time'
  if (/top.*db|db.*access|database|sql/.test(n)) return 'topdb'
  if (/top.*resp|response|respon|slow|peak/.test(n)) return 'topresp'
  if (/transaction|tcode|tx|std|profile/.test(n)) return 'txstd'
  if (/workload|overview|task|dialog|btc|background/.test(n)) return 'workload'
  return ''
}

async function fileToB64(file) {
  const buf = await file.arrayBuffer()
  let bin = ''
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

async function storePack(kind, file) {
  if (!kind || !file) return
  const payload = {
    name: file.name,
    type: file.type || 'application/octet-stream',
    lastModified: file.lastModified || Date.now(),
    b64: await fileToB64(file),
  }
  sessionStorage.setItem(PACK_PREFIX + kind, JSON.stringify(payload))
}

async function extractZip(zipFile) {
  const zip = await JSZip.loadAsync(await zipFile.arrayBuffer())
  const files = []
  for (const item of Object.values(zip.files)) {
    if (item.dir) continue
    const name = String(item.name || '').replace(/^\/+/, '').replace(/\//g, '__')
    if (!/\.(xlsx|xls|csv)$/i.test(name)) continue
    const blob = await item.async('blob')
    files.push(new File([blob], name, { type: blob.type || 'application/octet-stream' }))
  }
  return files
}

function toast(text) {
  const el = document.createElement('div')
  el.textContent = text
  el.style.cssText = 'position:fixed;z-index:999999;top:12px;right:12px;max-width:360px;background:#061f1c;color:#effffc;border:1px solid rgba(45,212,191,.35);border-radius:14px;padding:11px 13px;font:800 12px system-ui;box-shadow:0 16px 36px rgba(0,0,0,.35)'
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 4200)
}

async function handleZip(file) {
  const files = await extractZip(file)
  const found = {}
  for (const f of files) {
    const kind = classify(f.name)
    if (!kind || found[kind]) continue
    found[kind] = f
    await storePack(kind, f)
  }
  const keys = Object.keys(found)
  if (!keys.length) {
    toast('ST03N ZIP terbaca, tapi nama file belum bisa diklasifikasikan. Pakai nama: workload/topdb/topresp/transaction/time.')
    return
  }
  toast(`ST03N ZIP workspace loaded: ${keys.join(', ')}. Analyzer akan auto-load dari session.`)
  if (location.hash.includes('/tool/analyzer')) location.reload()
  else location.hash = '#/tool/analyzer'
}

function enhanceAnalyzerPage() {
  if (!location.hash.includes('/tool/analyzer')) return
  if (document.getElementById('cbj-st03n-zip-zone')) return
  const root = document.querySelector('.fullBleed') || document.querySelector('main') || document.body
  const zone = document.createElement('section')
  zone.id = 'cbj-st03n-zip-zone'
  zone.innerHTML = `
    <div style="margin:10px;border:1px dashed rgba(45,212,191,.35);border-radius:18px;background:linear-gradient(180deg,rgba(9,42,37,.82),rgba(5,14,16,.92));padding:14px;color:#effffc;box-shadow:0 14px 34px rgba(0,0,0,.22)">
      <div style="font-weight:1000;font-size:14px;margin-bottom:4px">ST03N ZIP Workspace Import</div>
      <div style="font-size:11px;color:rgba(222,241,238,.65);line-height:1.45;margin-bottom:10px">Upload satu ZIP berisi export ST03N. File akan auto-map ke workload, top DB, top response, transaction profile, dan time profile.</div>
      <input id="cbj-st03n-zip-input" type="file" accept="${ACCEPT}" style="width:100%;border:1px solid rgba(203,244,238,.14);border-radius:12px;background:rgba(0,0,0,.22);color:#effffc;padding:10px;font-size:12px" />
    </div>`
  root.prepend(zone)
  zone.querySelector('input').addEventListener('change', async (e) => {
    const file = Array.from(e.target.files || []).find(f => /\.zip$/i.test(f.name || ''))
    if (file) await handleZip(file)
  })
}

function installGlobalZipCatcher() {
  document.querySelectorAll('input[type=file]').forEach(input => {
    if (input.dataset.cbjSt03nZip === '1') return
    input.dataset.cbjSt03nZip = '1'
    input.accept = [input.accept, ACCEPT].filter(Boolean).join(',')
    input.addEventListener('change', async (e) => {
      if (!location.hash.includes('/tool/analyzer')) return
      const file = Array.from(input.files || []).find(f => /\.zip$/i.test(f.name || ''))
      if (file) {
        e.preventDefault()
        e.stopPropagation()
        await handleZip(file)
      }
    }, true)
  })
}

export function installSt03nZipWorkspace() {
  if (typeof window === 'undefined' || window[INSTALLED]) return
  window[INSTALLED] = true
  setTimeout(enhanceAnalyzerPage, 200)
  setTimeout(installGlobalZipCatcher, 300)
  window.addEventListener('hashchange', () => {
    setTimeout(enhanceAnalyzerPage, 250)
    setTimeout(installGlobalZipCatcher, 350)
  })
  window.addEventListener('click', () => setTimeout(installGlobalZipCatcher, 150), true)
}

installSt03nZipWorkspace()
