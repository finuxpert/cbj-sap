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
  const score = hasMetric(local.score) ? Number(local.score) : null
  if (score === null) return '—'
  const label = score >= 95 ? 'Complete' : score >= 80 ? 'Good' : score >= 60 ? 'Limited' : 'Low'
  return `${label} · ${fmt(score, 0)}%`
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

function timingSuffix(timing = {}, direction = '') {
  const delta = hasMetric(timing?.deltaMinutes) ? Math.abs(Number(timing.deltaMinutes)) : null
  if (timing?.state === 'NEW_BEFORE_TARGET') return delta === null ? 'before' : `${fmt(delta, 0)}m before`
  if (timing?.state === 'NEW_AT_TARGET') return 'at target'
  if (timing?.state === 'NEW_AFTER_TARGET') return delta === null ? 'after' : `${fmt(delta, 0)}m after`
  if (timing?.state === 'PERSISTENT_NEAR_TARGET') return 'persistent'
  if (direction === 'POTENTIAL_PRECURSOR') return 'precursor'
  if (direction === 'LIKELY_SYMPTOM') return 'symptom'
  if (direction === 'SUPPORTING_SIGNAL') return 'supporting'
  return ''
}

function errorText(row = {}) {
  const taxonomy = row.errorTaxonomy || {}
  const strongest = taxonomy.strongest || {}
  const category = strongest.category
  if (category && category !== 'NONE') {
    const suffix = timingSuffix(strongest.timing, taxonomy.direction)
    return `${humanize(category)}${suffix ? ` · ${suffix}` : ''}`
  }
  if (row.errorState && row.errorState !== 'NONE') return humanize(row.errorState)
  return '—'
}

function errorTone(row = {}) {
  const timing = row.errorTaxonomy?.strongest?.timing || {}
  if (timing.state === 'PERSISTENT_NEAR_TARGET') return 'persistent'
  if (timing.state === 'NEW_BEFORE_TARGET' || row.errorTaxonomy?.direction === 'POTENTIAL_PRECURSOR') return 'precursor'
  if (timing.state === 'NEW_AT_TARGET') return 'at-target'
  return ''
}

export default function VirtualResourceTableV14({ rows = [], selectedKey = '', onSelect }) {
  const [sorting, setSorting] = React.useState([{ id: 'causalScore', desc: true }])
  const [globalFilter, setGlobalFilter] = React.useState('')
  const columns = React.useMemo(() => [
    { accessorKey: 'host', header: 'Host', size: 128 },
    { accessorKey: 'workload', header: 'Workload / Job', size: 280 },
    { accessorKey: 'incidentRole', header: 'Role', size: 145, cell: ({ getValue }) => humanize(getValue()) },
    { accessorKey: 'causalScore', header: 'Priority', size: 86, cell: ({ getValue }) => <b className="logV2Score">{fmt(getValue(), 0)}</b> },
    { id: 'evidence', accessorFn: (row) => row.localConfidence?.score ?? 0, header: 'Local Data', size: 126, cell: ({ row }) => confidenceText(row.original) },
    { accessorKey: 'targetCpu', header: 'CPU', size: 82, cell: ({ getValue }) => hasMetric(getValue()) ? `${fmt(getValue(), 1)}%` : '—' },
    { id: 'memory', accessorFn: (row) => row.targetPssGb ?? row.targetMaxPidRss ?? -1, header: 'Memory', size: 165, cell: ({ row }) => memoryText(row.original) },
    { id: 'blocking', accessorFn: (row) => row.targetDState ?? 0, header: 'Blocking', size: 130, cell: ({ row }) => blockingText(row.original) },
    { id: 'error', accessorFn: (row) => row.errorTaxonomy?.strongest?.category || row.errorState || '', header: 'Error / Timing', size: 210, cell: ({ row }) => <span className={`logV143Error ${errorTone(row.original)}`}>{errorText(row.original)}</span> },
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
      return [item.host, item.workload, item.program, item.incidentRole, item.targetEvidence, item.wchanClass, item.targetWchan, item.errorState, item.errorTaxonomy?.strongest?.category, item.errorTaxonomy?.direction, ...(item.errors || [])].join(' ').toLowerCase().includes(needle)
    },
  })

  const bodyRef = React.useRef(null)
  const tableRows = table.getRowModel().rows
  const virtualizer = useVirtualizer({ count: tableRows.length, getScrollElement: () => bodyRef.current, estimateSize: () => 42, overscan: 12 })
  const gridTemplate = '128px minmax(280px,1.8fr) 145px 86px 126px 82px 165px 130px minmax(210px,1.2fr) 88px'
  const minWidth = 1420

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

export const __test = { confidenceText, errorText, timingSuffix, errorTone }
