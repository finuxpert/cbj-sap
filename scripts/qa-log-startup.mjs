// Usage: npm run build -- --manifest && node scripts/qa-log-startup.mjs
// Use --report-only [dist-directory] to measure an older baseline without the gate.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'

const args = process.argv.slice(2)
const reportOnly = args.includes('--report-only')
const root = resolve(args.find((arg) => !arg.startsWith('--')) || 'dist')
const manifest = JSON.parse(readFileSync(resolve(root, '.vite/manifest.json'), 'utf8'))
const entries = Object.entries(manifest)
const logEntry = entries.find(([, item]) => item.name === 'ToolLogAutoRcaV5')?.[0]
assert.ok(logEntry, 'The active LOG analysis chunk must exist')

const initialKeys = new Set()
function visit(key) {
  if (initialKeys.has(key)) return
  assert.ok(manifest[key], `Missing manifest entry: ${key}`)
  initialKeys.add(key)
  for (const dependency of manifest[key].imports || []) visit(dependency)
}
// These are the only dynamic route entries rendered before upload. Follow static
// imports recursively, counting shared shell dependencies once and excluding assets.
for (const key of ['index.html', 'src/tools/ToolLogWorkspace.jsx', logEntry]) visit(key)

function measure(file) {
  const bytes = readFileSync(resolve(root, file))
  return { file, bytes: bytes.length, gzipBytes: gzipSync(bytes).length }
}
const initialJs = [...initialKeys].map((key) => manifest[key].file).filter((file) => file.endsWith('.js')).sort().map(measure)
const deferred = entries.filter(([, item]) => /^(LogLandscapeEChart|VirtualResourceTableV14|jszip)/.test(item.name || ''))
if (!reportOnly) {
  for (const name of ['LogLandscapeEChartV14', 'VirtualResourceTableV14', 'jszip']) {
    assert.ok(deferred.some(([, item]) => item.name === name), `Missing deferred ${name} chunk`)
  }
  for (const [key, item] of deferred) assert.ok(!initialKeys.has(key), `${item.name} must not load before upload`)
}

const duckdbAssets = [...new Set(entries.flatMap(([, item]) => item.assets || []).filter((file) => /duckdb-/.test(file)))].sort().map((file) => {
  const bytes = readFileSync(resolve(root, file))
  return { file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
})
const oversizedChunks = entries.filter(([, item]) => item.file.endsWith('.js') && item.name).map(([, item]) => measure(item.file)).filter((item) => item.bytes > 800000)
console.log(JSON.stringify({
  initialJs,
  initialTotal: { bytes: initialJs.reduce((sum, item) => sum + item.bytes, 0), gzipBytes: initialJs.reduce((sum, item) => sum + item.gzipBytes, 0) },
  logChunk: measure(manifest[logEntry].file),
  resultOrZipChunks: deferred.map(([, item]) => measure(item.file)),
  duckdbAssets,
  oversizedChunks,
  startupGate: reportOnly ? 'REPORT_ONLY' : 'PASS',
}, null, 2))
