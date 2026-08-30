import React from 'react'
import { flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'

const hasMetric = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
const fmt = (value, digits = 1) => hasMetric(value) ? Number(value).toLocaleString('en-US', { maximumFractionDigits: digits }) : '—'

function toneForError(value = '') {
  if (value === 'NEW_AT_TARGET') return 'critical'
  if (value === 'NEW_BEFORE_TARGET' || value === 'PERSISTENT_NEAR_TARGET') return 'warn'
  if (value === 'NEW_AFTER_TARGET' || value === 'OFF_TARGET') return 'neutral'
  return 'good'
}

function evidenceLabel(value = '') {
  if (value === 'EXACT_TARGET') return 'EXACT'
  if (value === 'ADJACENT_TARGET') return 'ADJACENT'
  return 'NONE'
}

export default function VirtualResourceTable({ rows = [], selectedKey = '', onSelect }) {
  const [sorting, setSorting] = React.useState([{ id: 'incidentScore', desc: true }])
  const [globalFilter, setGlobalFilter] = React.useState('')
  const columns = React.useMemo(() => [
    { accessorKey: 'host', header: 'Host', size: 120 },
    { accessorKey: 'workload', header: 'Workload / Job', size: 255 },
    { accessorKey: 'program', header: 'Program', size: 175 },
    { accessorKey: 'incidentScore', header: 'Incident Score', size: 125, cell: ({ getValue }) => <b className="logV2Score">{fmt(getValue(), 0)}</b> },
    { accessorKey: 'footprintScore', header: 'Footprint', size: 90, cell: ({ getValue }) => fmt(getValue(), 0) },
    { accessorKey: 'targetHostSeverity', header: 'Host @ Incident', size: 120 },
    { accessorKey: 'targetEvidence', header: 'Target Evidence', size: 115, cell: ({ getValue }) => evidenceLabel(getValue()) },
    { accessorKey: 'incidentAlignment', header: 'Incident Align.', size: 115, cell: ({ getValue }) => hasMetric(getValue()) ? `${fmt(getValue(), 0)}%` : '—' },
    { accessorKey: 'targetCpu', header: 'CPU Σ @ Incident', size: 125, cell: ({ getValue }) => hasMetric(getValue()) ? `${fmt(getValue(), 1)}%` : '—' },
    { accessorKey: 'targetMaxPidRss', header: 'Max PID RSS @ Incident', size: 150, cell: ({ getValue }) => hasMetric(getValue()) ? `${fmt(getValue(), 2)} GB` : '—' },
    { accessorKey: 'cpuContributionPct', header: 'CPU Contrib.', size: 105, cell: ({ getValue }) => hasMetric(getValue()) ? `${fmt(getValue(), 1)}%` : '—' },
    { accessorKey: 'memoryLowerContributionPct', header: 'Mem Lower Bound', size: 125, cell: ({ getValue }) => hasMetric(getValue()) ? `${fmt(getValue(), 1)}%` : '—' },
    { accessorKey: 'targetDState', header: 'D @ Incident', size: 95 },
    { accessorKey: 'targetConcurrentPids', header: 'PIDs @ Incident', size: 105 },
    { accessorKey: 'peakCpu', header: 'Window Peak CPU Σ', size: 130, cell: ({ getValue }) => hasMetric(getValue()) ? `${fmt(getValue(), 1)}%` : '—' },
    { accessorKey: 'peakMaxPidRss', header: 'Window Max PID RSS', size: 135, cell: ({ getValue }) => hasMetric(getValue()) ? `${fmt(getValue(), 2)} GB` : '—' },
    { accessorKey: 'presenceCount', header: 'Observed', size: 82 },
    { accessorKey: 'errorState', header: 'Error Timing', size: 180, cell: ({ getValue }) => <span className={`logV2ErrorState ${toneForError(getValue())}`}>{getValue()}</span> },
    { accessorKey: 'errors', header: 'Errors', size: 280, cell: ({ getValue }) => (getValue() || []).join(', ') || '—' },
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
      return [item.host, item.workload, item.program, item.type, item.errorState, item.targetEvidence, item.targetHostSeverity, ...(item.errors || [])].join(' ').toLowerCase().includes(needle)
    },
  })

  const bodyRef = React.useRef(null)
  const tableRows = table.getRowModel().rows
  const virtualizer = useVirtualizer({ count: tableRows.length, getScrollElement: () => bodyRef.current, estimateSize: () => 42, overscan: 10 })
  const gridTemplate = columns.map((column) => `${column.size || 120}px`).join(' ')

  return <div className="logV2TableShell">
    <div className="logV2TableToolbar">
      <input value={globalFilter ?? ''} onChange={(event) => setGlobalFilter(event.target.value)} placeholder="Search job, host, program, error…" />
      <span><b>{tableRows.length}</b> of {rows.length} workloads · primary sort = incident relevance · footprint is full-window context</span>
    </div>
    <div className="logV2TableHeader" style={{ gridTemplateColumns: gridTemplate }}>
      {table.getFlatHeaders().map((header) => <button key={header.id} type="button" onClick={header.column.getToggleSortingHandler()} className={header.column.getCanSort() ? 'sortable' : ''}>
        {flexRender(header.column.columnDef.header, header.getContext())}<span>{header.column.getIsSorted() === 'asc' ? ' ↑' : header.column.getIsSorted() === 'desc' ? ' ↓' : ''}</span>
      </button>)}
    </div>
    <div className="logV2VirtualBody" ref={bodyRef}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', minWidth: `${columns.reduce((sum, column) => sum + (column.size || 120), 0)}px` }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = tableRows[virtualRow.index]
          const active = row.original.key === selectedKey
          return <button key={row.id} type="button" className={`logV2VirtualRow ${active ? 'active' : ''}`} style={{ gridTemplateColumns: gridTemplate, transform: `translateY(${virtualRow.start}px)` }} onClick={() => onSelect?.(row.original)}>
            {row.getVisibleCells().map((cell) => <span key={cell.id} title={typeof cell.getValue() === 'string' ? cell.getValue() : undefined}>{flexRender(cell.column.columnDef.cell ?? ((ctx) => String(ctx.getValue() ?? '—')), cell.getContext())}</span>)}
          </button>
        })}
      </div>
    </div>
  </div>
}
