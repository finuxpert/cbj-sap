import React from 'react'
import { flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'

const hasMetric = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
const fmt = (value, digits = 1) => hasMetric(value) ? Number(value).toLocaleString('en-US', { maximumFractionDigits: digits }) : '—'

function evidenceLabel(value = '') {
  return ({
    EXACT_TARGET: 'EXACT',
    NEAR_TARGET: 'NEAR',
    EARLY_TARGET: 'EARLY',
    LATE_TARGET: 'LATE',
    OFF_TARGET: 'OFF',
    ADJACENT_TARGET: 'ADJACENT',
  })[value] || 'NONE'
}

function errorTone(value = '') {
  if (value === 'NEW_AT_TARGET') return 'critical'
  if (value === 'NEW_BEFORE_TARGET' || value === 'PERSISTENT_NEAR_TARGET') return 'warn'
  return 'neutral'
}

function cpuShare(item = {}) {
  if (item.cpuContributionStatus === 'TEMPORAL_MISMATCH') return 'not synchronized'
  if (item.cpuContributionStatus === 'UNAVAILABLE_TARGET_CPU') return 'CPU unavailable'
  if (item.cpuContributionStatus === 'UNAVAILABLE_HOST_CPU_SCALE') return 'host scale unavailable'
  if (item.cpuContributionStatus === 'INCONSISTENT_SCALE') return 'scale rejected'
  return hasMetric(item.estimatedCpuSharePct) ? `${fmt(item.estimatedCpuSharePct, 1)}%` : '—'
}

export default function VirtualResourceTableV14({ rows = [], selectedKey = '', onSelect }) {
  const [sorting, setSorting] = React.useState([{ id: 'causalScore', desc: true }])
  const [globalFilter, setGlobalFilter] = React.useState('')
  const columns = React.useMemo(() => [
    { accessorKey: 'host', header: 'Host', size: 120 },
    { accessorKey: 'workload', header: 'Workload / Job', size: 235 },
    { accessorKey: 'program', header: 'Program', size: 165 },
    { accessorKey: 'incidentRole', header: 'Role v2', size: 145 },
    { accessorKey: 'causalScore', header: 'Causal', size: 82, cell: ({ getValue }) => <b className="logV2Score">{fmt(getValue(), 0)}</b> },
    { accessorKey: 'incidentScore', header: 'Relevance', size: 86, cell: ({ getValue }) => fmt(getValue(), 0) },
    { accessorKey: 'victimScore', header: 'Victim', size: 72, cell: ({ getValue }) => fmt(getValue(), 0) },
    { id: 'localConf', accessorFn: (row) => row.localConfidence?.score ?? 0, header: 'Local Conf.', size: 100, cell: ({ row }) => `${row.original.localConfidence?.grade || '—'} ${row.original.localConfidence?.score ?? '—'}` },
    { id: 'landscapeConf', accessorFn: (row) => row.landscapeConfidence?.score ?? 0, header: 'Landscape', size: 100, cell: ({ row }) => `${row.original.landscapeConfidence?.grade || '—'} ${row.original.landscapeConfidence?.score ?? '—'}` },
    { accessorKey: 'targetHostSeverity', header: 'Host @ Incident', size: 115 },
    { accessorKey: 'targetHostEvidenceSeverity', header: 'Host @ Evidence', size: 115 },
    { accessorKey: 'targetEvidence', header: 'Target', size: 82, cell: ({ getValue }) => evidenceLabel(getValue()) },
    { accessorKey: 'targetDeltaMinutes', header: 'Δ min', size: 62, cell: ({ getValue }) => hasMetric(getValue()) ? `${Number(getValue()) > 0 ? '+' : ''}${fmt(getValue(), 0)}` : '—' },
    { accessorKey: 'targetCpu', header: 'CPU Σ', size: 82, cell: ({ getValue }) => hasMetric(getValue()) ? `${fmt(getValue(), 1)}%` : '—' },
    { id: 'cpuShare', accessorFn: (row) => row.estimatedCpuSharePct ?? -1, header: 'Est CPU Share', size: 115, cell: ({ row }) => cpuShare(row.original) },
    { accessorKey: 'targetPssGb', header: 'PSS Σ', size: 85, cell: ({ getValue }) => hasMetric(getValue()) ? `${fmt(getValue(), 2)} GB` : '—' },
    { accessorKey: 'targetMaxPidRss', header: 'Max PID RSS', size: 105, cell: ({ getValue }) => hasMetric(getValue()) ? `${fmt(getValue(), 2)} GB` : '—' },
    { accessorKey: 'wchanClass', header: 'WCHAN Class', size: 115 },
    { accessorKey: 'targetWchan', header: 'Top WCHAN', size: 170 },
    { accessorKey: 'targetReadMiBps', header: 'Read MiB/s', size: 95, cell: ({ getValue }) => fmt(getValue(), 2) },
    { accessorKey: 'targetWriteMiBps', header: 'Write MiB/s', size: 95, cell: ({ getValue }) => fmt(getValue(), 2) },
    { accessorKey: 'targetMajorFaultsPerMin', header: 'Majflt/min', size: 88, cell: ({ getValue }) => fmt(getValue(), 1) },
    { accessorKey: 'targetDState', header: 'D', size: 48 },
    { id: 'errorClass', accessorFn: (row) => row.errorTaxonomy?.strongest?.category || '', header: 'Error Class', size: 135, cell: ({ row }) => row.original.errorTaxonomy?.strongest?.category || '—' },
    { id: 'errorDirection', accessorFn: (row) => row.errorTaxonomy?.direction || '', header: 'Error Direction', size: 145, cell: ({ row }) => row.original.errorTaxonomy?.direction || '—' },
    { accessorKey: 'errorState', header: 'Error Timing', size: 165, cell: ({ getValue }) => <span className={`logV2ErrorState ${errorTone(getValue())}`}>{getValue()}</span> },
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
      return [
        item.host, item.workload, item.program, item.incidentRole, item.targetEvidence, item.targetHostSeverity,
        item.targetHostEvidenceSeverity, item.wchanClass, item.targetWchan, item.errorState,
        item.errorTaxonomy?.strongest?.category, item.errorTaxonomy?.direction, ...(item.errors || []),
      ].join(' ').toLowerCase().includes(needle)
    },
  })

  const bodyRef = React.useRef(null)
  const tableRows = table.getRowModel().rows
  const virtualizer = useVirtualizer({ count: tableRows.length, getScrollElement: () => bodyRef.current, estimateSize: () => 42, overscan: 12 })
  const gridTemplate = columns.map((column) => `${column.size || 120}px`).join(' ')
  const minWidth = columns.reduce((sum, column) => sum + (column.size || 120), 0)

  return <div className="logV2TableShell">
    <div className="logV2TableToolbar">
      <input value={globalFilter ?? ''} onChange={(event) => setGlobalFilter(event.target.value)} placeholder="Search job, role, WCHAN, host, error…" />
      <span><b>{tableRows.length}</b> of {rows.length} workloads · causal priority + PSS/WCHAN/I/O evidence · local and landscape confidence remain separate</span>
    </div>
    <div className="logV2TableHeader" style={{ gridTemplateColumns: gridTemplate }}>
      {table.getFlatHeaders().map((header) => <button key={header.id} type="button" onClick={header.column.getToggleSortingHandler()} className={header.column.getCanSort() ? 'sortable' : ''}>
        {flexRender(header.column.columnDef.header, header.getContext())}<span>{header.column.getIsSorted() === 'asc' ? ' ↑' : header.column.getIsSorted() === 'desc' ? ' ↓' : ''}</span>
      </button>)}
    </div>
    <div className="logV2VirtualBody" ref={bodyRef}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', minWidth: `${minWidth}px` }}>
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
