import React from 'react'
import Fuse from 'fuse.js'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { fmt } from './evidence-utils.js'

function compactLabel(value = '', max = 42) {
  const label = String(value || 'Unknown').trim() || 'Unknown'
  return label.length > max ? `${label.slice(0, Math.max(10, max - 1))}…` : label
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

export default function St03nOffenderTable({ rows = [] }) {
  const [query, setQuery] = React.useState('')
  const [component, setComponent] = React.useState('all')
  const [sorting, setSorting] = React.useState([{ id: 'score', desc: true }])

  const normalizedRows = React.useMemo(() => normalizeRows(rows), [rows])
  const components = React.useMemo(() => (
    Array.from(new Set(normalizedRows.map((row) => row.component))).sort()
  ), [normalizedRows])

  const searchedRows = React.useMemo(() => {
    const scoped = component === 'all'
      ? normalizedRows
      : normalizedRows.filter((row) => row.component === component)

    if (!query.trim()) return scoped

    const fuse = new Fuse(scoped, {
      keys: ['name', 'component', 'kind', 'fileName'],
      threshold: 0.32,
      ignoreLocation: true,
    })

    return fuse.search(query.trim()).map((item) => item.item)
  }, [component, normalizedRows, query])

  const columns = React.useMemo(() => [
    {
      accessorKey: 'rank',
      header: '#',
      cell: ({ row }) => <b style={{ color: '#7dd3fc' }}>#{row.original.rank}</b>,
    },
    {
      accessorKey: 'name',
      header: 'Offender',
      cell: ({ row }) => (
        <div>
          <b style={{ color: 'rgba(248,250,252,.96)' }}>{row.original.name}</b>
          <div style={{ color: 'rgba(148,163,184,.78)', marginTop: 4 }}>{row.original.kind} · {row.original.fileName}</div>
        </div>
      ),
    },
    { accessorKey: 'component', header: 'Component' },
    {
      accessorKey: 'score',
      header: 'Score',
      cell: ({ getValue }) => <b>{fmt(getValue(), 0)}/100</b>,
    },
    {
      accessorKey: 'response',
      header: 'Response',
      cell: ({ getValue }) => `${fmt(getValue(), 0)}ms`,
    },
    {
      accessorKey: 'db',
      header: 'DB Time',
      cell: ({ getValue }) => `${fmt(getValue(), 0)}ms`,
    },
    {
      accessorKey: 'wait',
      header: 'Wait',
      cell: ({ getValue }) => `${fmt(getValue(), 0)}ms`,
    },
    {
      accessorKey: 'cpu',
      header: 'CPU',
      cell: ({ getValue }) => `${fmt(getValue(), 0)}ms`,
    },
    {
      accessorKey: 'steps',
      header: 'Steps',
      cell: ({ getValue }) => fmt(getValue(), 0),
    },
    {
      id: 'dominant',
      header: 'Dominant',
      cell: ({ row }) => dominantKind(row.original),
    },
  ], [])

  const table = useReactTable({
    data: searchedRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

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
        Showing <b style={{ color: 'rgba(248,250,252,.94)' }}>{searchedRows.length}</b> of <b style={{ color: 'rgba(248,250,252,.94)' }}>{normalizedRows.length}</b> parsed offenders. Click column headers to sort.
      </div>

      <div style={tableShellStyle}>
        <table style={tableStyle}>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} style={thStyle} onClick={header.column.getToggleSortingHandler()}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() === 'asc' ? ' ↑' : header.column.getIsSorted() === 'desc' ? ' ↓' : ''}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} style={tdStyle}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
            {!table.getRowModel().rows.length ? (
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
