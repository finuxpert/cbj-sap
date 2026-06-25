import React from 'react'
import { fmt } from './evidence-utils.js'

function compactLabel(value = '', max = 42) {
  const label = String(value || 'Unknown').trim() || 'Unknown'
  return label.length > max ? `${label.slice(0, Math.max(10, max - 1))}…` : label
}

function normalizeSearch(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function rowMatchesQuery(row = {}, query = '') {
  const normalizedQuery = normalizeSearch(query)
  if (!normalizedQuery) return true
  const haystack = normalizeSearch([
    row.name,
    row.component,
    row.kind,
    row.fileName,
    row.label,
    row.program,
    row.transaction,
  ].filter(Boolean).join(' '))
  return normalizedQuery.split(/\s+/).every((token) => haystack.includes(token))
}

function normalizeRows(rows = []) {
  return rows.map((row, index) => ({
    ...row,
    rank: index + 1,
    name: compactLabel(row.label || row.name || row.program || row.transaction || row.fileName || row.kind || `ST03N item ${index + 1}`),
    response: Math.round(Number(row.response ?? row.responseMs ?? 0)),
    db: Math.round(Number(row.db ?? row.dbMs ?? 0)),
    wait: Math.round(Number(row.wait ?? row.waitMs ?? 0)),
    cpu: Math.round(Number(row.cpu ?? row.cpuMs ?? 0)),
    steps: Math.round(Number(row.steps || 0)),
    score: Math.round(Number(row.score || 0)),
    component: row.component || 'Workload',
    kind: row.kind || 'ST03N',
    fileName: row.fileName || '-',
  }))
}

function dominantKind(row = {}) {
  const entries = [
    ['Response', Number(row.response || 0)],
    ['DB', Number(row.db || 0)],
    ['Wait', Number(row.wait || 0)],
    ['CPU', Number(row.cpu || 0)],
  ]
  return entries.sort((a, b) => b[1] - a[1])[0]?.[0] || 'Response'
}

function compareRows(a, b, key) {
  const aValue = a[key]
  const bValue = b[key]
  if (typeof aValue === 'number' && typeof bValue === 'number') return aValue - bValue
  return String(aValue || '').localeCompare(String(bValue || ''), undefined, { numeric: true, sensitivity: 'base' })
}

const tableShellStyle = {
  overflow: 'auto',
  border: '1px solid rgba(148,163,184,.16)',
  borderRadius: 16,
  maxHeight: 520,
}

const inputStyle = {
  width: '100%',
  minHeight: 38,
  borderRadius: 12,
  border: '1px solid rgba(148,163,184,.22)',
  background: 'rgba(15,23,42,.42)',
  color: 'rgba(248,250,252,.94)',
  padding: '0 12px',
  outline: 'none',
  fontWeight: 800,
}

const selectStyle = {
  ...inputStyle,
  width: 'auto',
  minWidth: 180,
}

const tableStyle = {
  width: '100%',
  borderCollapse: 'separate',
  borderSpacing: 0,
  minWidth: 980,
}

const thStyle = {
  position: 'sticky',
  top: 0,
  zIndex: 1,
  background: 'rgba(15,23,42,.96)',
  color: '#7dd3fc',
  textAlign: 'left',
  padding: '12px 12px',
  fontSize: 11,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  borderBottom: '1px solid rgba(148,163,184,.18)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const tdStyle = {
  padding: '12px 12px',
  borderBottom: '1px solid rgba(148,163,184,.12)',
  color: 'rgba(226,232,240,.88)',
  fontSize: 12,
  verticalAlign: 'top',
  whiteSpace: 'nowrap',
}

const columns = [
  { key: 'rank', label: '#' },
  { key: 'name', label: 'Offender' },
  { key: 'component', label: 'Component' },
  { key: 'score', label: 'Score' },
  { key: 'response', label: 'Response' },
  { key: 'db', label: 'DB Time' },
  { key: 'wait', label: 'Wait' },
  { key: 'cpu', label: 'CPU' },
  { key: 'steps', label: 'Steps' },
  { key: 'dominant', label: 'Dominant' },
]

export default function St03nOffenderTable({ rows = [] }) {
  const [query, setQuery] = React.useState('')
  const [component, setComponent] = React.useState('all')
  const [sort, setSort] = React.useState({ key: 'score', direction: 'desc' })

  const normalizedRows = React.useMemo(() => normalizeRows(rows), [rows])
  const components = React.useMemo(() => (
    Array.from(new Set(normalizedRows.map((row) => row.component))).sort()
  ), [normalizedRows])

  const visibleRows = React.useMemo(() => {
    const filtered = normalizedRows
      .filter((row) => component === 'all' || row.component === component)
      .filter((row) => rowMatchesQuery(row, query))
      .map((row) => ({ ...row, dominant: dominantKind(row) }))

    return [...filtered].sort((a, b) => {
      const result = compareRows(a, b, sort.key)
      return sort.direction === 'asc' ? result : -result
    })
  }, [component, normalizedRows, query, sort])

  const toggleSort = (key) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc',
    }))
  }

  const renderCell = (row, key) => {
    if (key === 'rank') return <b style={{ color: '#7dd3fc' }}>#{row.rank}</b>
    if (key === 'name') {
      return (
        <div>
          <b style={{ color: 'rgba(248,250,252,.96)' }}>{row.name}</b>
          <div style={{ color: 'rgba(148,163,184,.78)', marginTop: 4 }}>{row.kind} · {row.fileName}</div>
        </div>
      )
    }
    if (key === 'score') return <b>{fmt(row.score, 0)}/100</b>
    if (['response', 'db', 'wait', 'cpu'].includes(key)) return `${fmt(row[key], 0)}ms`
    if (key === 'steps') return fmt(row.steps, 0)
    return row[key]
  }

  return (
    <section className="evidencePanel st03nBreakdownPanel visual">
      <div className="panelTitleRow">
        <h2>Offender Analysis Table</h2>
        <span>Search / filter / sort</span>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ flex: '1 1 320px' }}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search TCode, program, file, component..."
            style={inputStyle}
          />
        </div>
        <select value={component} onChange={(event) => setComponent(event.target.value)} style={selectStyle}>
          <option value="all">All components</option>
          {components.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>

      <div style={{ color: 'rgba(148,163,184,.82)', fontSize: 12, marginBottom: 10 }}>
        Showing <b style={{ color: 'rgba(248,250,252,.94)' }}>{visibleRows.length}</b> of <b style={{ color: 'rgba(248,250,252,.94)' }}>{normalizedRows.length}</b> parsed offenders. Click column headers to sort.
      </div>

      <div style={tableShellStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} style={thStyle} onClick={() => toggleSort(column.key)}>
                  {column.label}{sort.key === column.key ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={`${row.rank}-${row.name}-${row.fileName}`}>
                {columns.map((column) => (
                  <td key={`${row.rank}-${column.key}`} style={tdStyle}>{renderCell(row, column.key)}</td>
                ))}
              </tr>
            ))}
            {!visibleRows.length ? (
              <tr>
                <td colSpan={columns.length} style={{ ...tdStyle, textAlign: 'center', padding: 26 }}>
                  No matching offender rows.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}
