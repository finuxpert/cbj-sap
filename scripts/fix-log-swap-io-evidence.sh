#!/usr/bin/env bash
set -euo pipefail

FILE="src/tools/ToolLogEvidenceV2.jsx"

if [[ ! -f "$FILE" ]]; then
  echo "ERROR: $FILE not found. Run from repo root." >&2
  exit 1
fi

cp -av "$FILE" "$FILE.bak.swapio.$(date +%Y%m%d_%H%M%S)"

python3 <<'PY'
from pathlib import Path
import re

p = Path('src/tools/ToolLogEvidenceV2.jsx')
s = p.read_text()

# Wording fixes: si is swap-in IO, not swap used/capacity.
replacements = {
    'Swap si': 'Swap-in rate (si)',
    'Swap SI': 'Swap-in rate (si)',
    'swap si': 'swap-in rate (si)',
    'Mem % / Swap': 'Memory % / Swap IO',
    'Mem% / Swap': 'Memory % / Swap IO',
    'Memory / Swap': 'Memory / Swap IO',
    'Swap Evidence View': 'Swap Capacity Evidence View',
    'Swap data not found in uploaded logs': 'Swap capacity data not found in uploaded logs',
    'No swap pressure conclusion can be made from this evidence': 'No swap capacity pressure conclusion can be made from this evidence',
    'Swap evidence status': 'Swap capacity evidence status',
}
for old, new in replacements.items():
    s = s.replace(old, new)

# Add swap IO parser helper if not already present.
helper = r'''
function parseSwapIoSnapshot(text = '') {
  const raw = String(text || '')
  const m = raw.match(/Swap\s+IO\s*:\s*si\/so\s+([\d.]+)\/([\d.]+)\s*p\/s/i)
  if (!m) return { swapInPs: null, swapOutPs: null, swapIoDetected: false }
  const swapInPs = Number(m[1])
  const swapOutPs = Number(m[2])
  return {
    swapInPs: Number.isFinite(swapInPs) ? swapInPs : null,
    swapOutPs: Number.isFinite(swapOutPs) ? swapOutPs : null,
    swapIoDetected: true,
  }
}
'''
if 'function parseSwapIoSnapshot' not in s:
    insert_at = s.find('function parseWpRows')
    if insert_at != -1:
        s = s[:insert_at] + helper + '\n' + s[insert_at:]

# Ensure parseWpRows attaches swap IO fields to each parsed WP row.
if 'const swapIo = parseSwapIoSnapshot(text)' not in s:
    s = s.replace('  const mem = parseMemorySnapshot(text)\n  const rows = []', '  const mem = parseMemorySnapshot(text)\n  const swapIo = parseSwapIoSnapshot(text)\n  const rows = []')

if 'swapInPs: swapIo.swapInPs' not in s:
    s = s.replace('      swapGb: mem.swapGb,\n      state:', '      swapGb: mem.swapGb,\n      swapInPs: swapIo.swapInPs,\n      swapOutPs: swapIo.swapOutPs,\n      swapIoDetected: swapIo.swapIoDetected,\n      state:')

# Ensure generic rows also carry swap IO when possible.
if 'const swapIo = parseSwapIoSnapshot(text)' not in s[s.find('function parseGenericErrors'):s.find('function displayLabel')]:
    s = s.replace('  const rows = []\n  const mem = parseMemorySnapshot(text)', '  const rows = []\n  const mem = parseMemorySnapshot(text)\n  const swapIo = parseSwapIoSnapshot(text)')

# If generic rows have swapGb but no swap IO fields, attach them.
pattern = '      swapGb: mem.swapGb,\n      state:'
if pattern in s:
    s = s.replace(pattern, '      swapGb: mem.swapGb,\n      swapInPs: swapIo.swapInPs,\n      swapOutPs: swapIo.swapOutPs,\n      swapIoDetected: swapIo.swapIoDetected,\n      state:', 1)

# If a chart series named Swap-in rate exists, make it use explicit swapInPs and zero when detected as 0.
s = re.sub(r"name:\s*['\"]Swap-in rate \(si\)['\"]\s*,([^\n]*\n){0,8}?data:\s*items\.map\(\(item\)\s*=>\s*[^\)]*\)",
           "name: 'Swap-in rate (si)', type: 'line', smooth: true, symbolSize: 5, data: items.map((item) => Number(item.swapInPs || 0))",
           s)

# If old code maps swapGb as swap line, leave capacity panels intact but prevent it being labelled as si.
s = s.replace("name: 'Swap-in rate (si)', type: 'line', smooth: true, yAxisIndex: 1, symbolSize: 4, data: items.map((item) => item.swapGb || 0)",
              "name: 'Swap Capacity Total GB', type: 'line', smooth: true, yAxisIndex: 1, symbolSize: 4, data: items.map((item) => item.swapGb || 0)")

# Add swap IO aggregation to infra timeline if the object shape exists.
if 'swapInPs: 0,' not in s and 'swapGb: 0,' in s:
    s = s.replace('      swapGb: 0,\n      crit: 0,', '      swapGb: 0,\n      swapInPs: 0,\n      swapOutPs: 0,\n      swapIoDetected: false,\n      crit: 0,')
if 'current.swapInPs = Math.max(current.swapInPs' not in s and 'current.swapGb = Math.max(current.swapGb' in s:
    s = s.replace('    current.swapGb = Math.max(current.swapGb, Number(row.swapGb) || 0)\n', '    current.swapGb = Math.max(current.swapGb, Number(row.swapGb) || 0)\n    current.swapInPs = Math.max(current.swapInPs, Number(row.swapInPs) || 0)\n    current.swapOutPs = Math.max(current.swapOutPs, Number(row.swapOutPs) || 0)\n    current.swapIoDetected = current.swapIoDetected || Boolean(row.swapIoDetected)\n')

p.write_text(s)
PY

echo "Patched $FILE"
grep -n "Swap-in rate\|Swap IO\|parseSwapIoSnapshot\|swapInPs\|Swap Capacity" "$FILE" | head -80 || true
