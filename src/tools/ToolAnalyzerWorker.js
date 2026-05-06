import * as XLSX from 'xlsx'

self.onmessage = async (ev) => {
  const msg = ev?.data || {}
  const { id, kind } = msg
  try {
    if (kind !== 'xlsx') throw new Error('unsupported_kind')
    const buf = msg.buf
    const wb = XLSX.read(buf, { type: 'array' })
    const sheetName = wb.SheetNames[0]
    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true })
    self.postMessage({ id, ok: true, rows })
  } catch (e) {
    self.postMessage({ id, ok: false, error: String(e?.message || e) })
  }
}
