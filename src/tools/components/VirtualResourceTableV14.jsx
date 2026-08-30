import React from 'react'
import { flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'

const hasMetric = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
const fmt = (value, digits = 1) => hasMetric(value) ? Number(value).toLocaleString('en-US', { maximumFractionDigits: digits }) : '—'
const humanize = (value = '') => String(value || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase())

function evidenceLabel(value = '') {
  return ({ EXACT_TARGET: 'EXACT', NEAR_TARGET: 'NEAR', EARLY_TARGET: 'EARLY', LATE_TARGET: 'LATE', OFF_TARGET: 'OFF', ADJACENT_TARGET: 'ADJACENT' })[value] || 'NONE'
}

function confidenceText(row = {}) {
  const local = row.localConfidence || {}
  return `${local.grade || '—'}${hasMetric(local.score) ? ` ${fmt(local.score, 0)}` : ''}`
}

function memoryText(row = {}) {
  if (hasMetric(row.targetPssGb)) return `PSS ${fmt(row.targetPssGb, 2)} GB`
  if (hasMetric(row.targetMaxPidRss)) return `Max PID RSS ${fmt(row.targetMaxPidRss, 2)} GB`
  return '—'
}

function blockingText(row = {}) {
  if (row.enhancedEvidenceUsable && row.wchanClass && row.wchanClass !== 'NONE') return `${humanize(row.wchanClass)}${row.wchanScope === 'D_STATE' ? ' · D' : ''}`
  if (hasMetric(row.targetDState) && Number(row.targetDState) > 0) return `D ${row.targetDState}/${row.targetConcurrentPids || 0}`
  return '—'
}

function errorText(row = {}) {
  const category = row.errorTaxonomy?.strongest?.category
  if (category && category !== 'NONE') return humanize(category)
  if (row.errorState && row.errorState !== 'NONE') return humanize(row.errorState)
  return '—'
}

export default function VirtualResourceTableV14({ rows = [], selectedKey = '', onSelect }) {
  const [sorting, setSorting] = React.useState([{ id: 'causalScore', desc: true }])
  const [globalFilter, setGlobalFilter] = React.useState('')
  const columns = React.useMemo(() => [
    { accessorKey: 'host', header: 'Host', size: 128 },
    { accessorKey: 'workload', header: 'Workload / Job', size: 280 },
    { accessorKey: 'incidentRole', header: 'Role', size: 145, cell: ({ getValue }) => humanize(getValue()) },
    { accessorKey: 'causalScore', header: 'Priority', size: 86, cell: ({ getValue }) => <b className="logV2Score">{fmt(getValue(), 0)}</b> },
    { id: 'evidence', accessorFn: (row) => row.localConfidence?.score ?? 0, header: 'Data Quality', size: 116, cell: ({ row }) => confidenceText(row.original) },
    { accessorKey: 'targetCpu', header: 'CPU', size: 82, cell: ({ getValue }) => hasMetric(getValue()) ? `${fmt(getValue(), 1)}%` : '—' },
    { id: 'memory', accessorFn: (row) => row.targetPssGb ?? row.targetMaxPidRss ?? -1, header: 'Memory', size: 165, cell: ({ row }) => memoryText(row.original) },
    { id: 'blocking', accessorFn: (row) => row.targetDState ?? 0, header: 'Blocking', size: 130, cell: ({ row }) => blockingText(row.original) },
    { id: 'error', accessorFn: (row) => row.errorTaxonomy?.strongest?.category || row.errorState || '', header: 'Error', size: 180, cell: ({ row }) => errorText(row.original) },
    { accessorKey: 'targetEvidence', header: 'Target', size: 88, cell: ({ getValue }) => evidenceLabel(getValue()) },
  ], [])

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, value) => {
      const needle = String(value || '').toLowerCase().trim()
      if (!needle) return true
      const item = row.original
      return [item.host, item.workload, item.program, item.incidentRole, item.targetEvidence, item.wchanClass, item.targetWchan, item.errorState, item.errorTaxonomy?.strongest?.category, ...(item.errors || [])].join(' ').toLowerCase().includes(needle)
    },
  })

  const bodyRef = React.useRef(null)
  const tableRows = table.getRowModel().rows
  const virtualizer = useVirtualizer({ count: tableRows.length, getScrollElement: () => bodyRef.current, estimateSize: () => 42, overscan: 12 })
  const gridTemplate = '128px minmax(280px,1.8fr) 145px 86px 116px 82px 165px 130px minmax(180px,1.15fr) 88px'
  const minWidth = 1380

  return <div className="logV2TableShell">
    <div className="logV2TableToolbar">
      <input value={globalFilter ?? ''} onChange={(event) => setGlobalFilter(event.target.value)} placeholder="Search host, job, role, WCHAN, error…" />
      <span><b>{tableRows.length}</b> workloads · sorted by incident priority</span>
    </div>
    <div className="logV2TableHeader" style={{ gridTemplateColumns: gridTemplate, minWidth: `${minWidth}px` }}>
      {table.getFlatHeaders().map((header) => <button key={header.id} type="button" onClick={header.column.getToggleSortingHandler()} className={header.column.getCanSort() ? 'sortable' : ''}>
        {flexRender(header.column.columnDef.header, header.getContext())}<span>{header.column.getIsSorted() === 'asc' ? ' ↑' : header.column.getIsSorted() === 'desc' ? ' ↓' : ''}</span>
      </button>)}
    </div>
    <div className="logV2VirtualBody" ref={bodyRef}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', minWidth: `${minWidth}px` }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = tableRows[virtualRow.index]
          const active = row.original.key === selectedKey
          return <button key={row.id} type="button" className={`logV2VirtualRow ${active ? 'active' : ''}`} style={{ gridTemplateColumns: gridTemplate, transform: `translateY(${virtualRow.start}px)`, minWidth: `${minWidth}px` }} onClick={() => onSelect?.(row.original)}>
            {row.getVisibleCells().map((cell) => <span key={cell.id} title={typeof cell.getValue() === 'string' ? cell.getValue() : undefined}>{flexRender(cell.column.columnDef.cell ?? ((ctx) => String(ctx.getValue() ?? '—')), cell.getContext())}</span>)}
          </button>
        })}
      </div>
    </div>
  </div>
}
