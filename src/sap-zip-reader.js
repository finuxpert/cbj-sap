import JSZip from 'jszip'

const mark = '__sapZipReaderInstalled'
const allowed = /\.(log|txt|csv|xlsx|xls)$/i

async function readZip(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const result = []
  for (const item of Object.values(zip.files)) {
    if (item.dir) continue
    const name = String(item.name || '').replace(/^\/+/, '').replace(/\//g, '__')
    if (!allowed.test(name)) continue
    const blob = await item.async('blob')
    result.push(new File([blob], name, { type: blob.type || 'application/octet-stream' }))
  }
  return result
}

function note(text) {
  const el = document.createElement('div')
  el.textContent = text
  el.style.cssText = 'position:fixed;z-index:999999;top:12px;right:12px;background:#06231f;color:#effffc;border:1px solid rgba(45,212,191,.35);border-radius:14px;padding:10px 12px;font:800 12px system-ui;box-shadow:0 16px 36px rgba(0,0,0,.35)'
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3500)
}

function setFiles(input, files) {
  const dt = new DataTransfer()
  files.forEach((f) => dt.items.add(f))
  input.files = dt.files
}

function hook(input) {
  if (!input || input.dataset.sapZipReader) return
  input.dataset.sapZipReader = '1'
  input.accept = '.zip,.log,.txt,.csv,.xlsx,.xls'
  input.addEventListener('change', async (event) => {
    if (input.dataset.sapZipDone === '1') {
      input.dataset.sapZipDone = '0'
      return
    }
    const files = Array.from(input.files || [])
    const zipFiles = files.filter((f) => /\.zip$/i.test(f.name || ''))
    if (!zipFiles.length) return
    event.preventDefault()
    event.stopPropagation()
    const expanded = []
    for (const f of files) {
      if (/\.zip$/i.test(f.name || '')) expanded.push(...await readZip(f))
      else expanded.push(f)
    }
    if (!expanded.length) {
      note('ZIP tidak berisi file evidence yang didukung')
      return
    }
    setFiles(input, expanded)
    input.dataset.sapZipDone = '1'
    note(`ZIP dibaca: ${expanded.length} file evidence`)
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, true)
}

function scan() {
  document.querySelectorAll('input[type=file]').forEach(hook)
}

export function installSapZipReader() {
  if (typeof window === 'undefined' || window[mark]) return
  window[mark] = true
  scan()
  window.addEventListener('load', scan)
  window.addEventListener('click', () => setTimeout(scan, 100), true)
}

installSapZipReader()
