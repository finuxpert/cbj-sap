import React from 'react'
import { flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'

const hasMetric = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
const fmt = (value, digits = 1) => hasMetric(value) ? Number(value).toLocaleString('en-US', { maximumFractionDigits: digits }) : '—'
const humanize = (value = '') => String(value || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase())
const operatorLabel = (value = '') => ({ DB_CONCURRENCY: 'DB Concurrency', ABAP_SERIALIZATION: 'ABAP Serialization', ABAP_DATA: 'ABAP Data', ERROR_SIGNAL: 'Error Activity', MIXED: 'Mixed Evidence', BLOCKED_VICTIM: 'Blocked Workload', RESOURCE_CONSUMER: 'Resource Consumer', MEMORY_CONSUMER: 'Memory Consumer', IO_CONSUMER: 'I/O Consumer', BACKGROUND: 'Background' })[String(value || '').toUpperCase()] || humanize(value)

function confidenceText(row = {}) {
  const local = row.localConfidence || {}
  const score = hasMetric(local.score) ? Number(local.score) : null
  if (score === null) return '—'
  const label = score >= 95 ? 'Complete' : score >= 80 ? 'Good' : score >= 60 ? 'Limited' : 'Low'
  return `${label} · ${fmt(score, 0)}%`
}

function memoryValue(row = {}, pointInTime = false) {
  if (pointInTime) return row.targetPssGb ?? row.targetRss ?? row.targetMaxPidRss ?? null
  return row.peakMaxPidRss ?? row.peakRss ?? row.targetPssGb ?? row.targetMaxPidRss ?? null
}

function memoryText(row = {}, pointInTime = false) {
  const value = memoryValue(row, pointInTime)
  if (!hasMetric(value)) return '—'
  const label = pointInTime && hasMetric(row.targetPssGb) ? 'PSS' : 'RSS'
  return `${label} ${fmt(value, 2)} GB`
}

function cpuValue(row = {}, pointInTime = false) {
  return pointInTime ? row.targetCpu : (row.peakCpu ?? row.targetCpu)
}

function blockingText(row = {}, pointInTime = false) {
  const value = pointInTime ? row.targetDState : row.dStateHits
  return hasMetric(value) ? fmt(value, 0) : '—'
}

function timingSuffix(timing = {}, direction = '') {
  const delta = hasMetric(timing?.deltaMinutes) ? Math.abs(Number(timing.deltaMinutes)) : null
  if (timing?.state === 'NEW_BEFORE_TARGET') return delta === null ? 'before' : `${fmt(delta, 0)} min before`
  if (timing?.state === 'NEW_AT_TARGET') return 'at target'
  if (timing?.state === 'NEW_AFTER_TARGET') return delta === null ? 'after' : `${fmt(delta, 0)} min after`
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
    return `${operatorLabel(category)}${suffix ? ` · ${suffix}` : ''}`
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

function hasError(row = {}) {
  return errorText(row) !== '—' || (row.errors || []).some((value) => value && value !== '?')
}

function findingText(row = {}, pointInTime = false) {
  const cpu = Number(cpuValue(row, pointInTime) || 0)
  const memory = Number(memoryValue(row, pointInTime) || 0)
  const dState = Number(pointInTime ? row.targetDState : row.dStateHits || 0)
  if (dState > 0) return 'D-STATE'
  if (cpu >= 80 && memory >= 2) return 'HIGH CPU · HIGH MEMORY'
  if (cpu >= 80) return 'HIGH CPU'
  if (memory >= 2) return 'HIGH MEMORY'
  if (hasError(row)) return 'ERROR'
  return 'NORMAL'
}

function shortTime(value = '') {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2})/)
  return match ? `${match[2]}-${match[3]} ${match[4]}` : value || '—'
}

function observedText(row = {}, pointInTime = false) {
  if (pointInTime) return shortTime(row.targetTime || row.targetHostEvidenceTime || '')
  const seen = Number(row.presenceCount || 0)
  const total = Number(row.hostSampleCount || 0)
  return total ? `${seen} of ${total} samples` : `${seen} samples`
}

function quickFilterMatch(row = {}, filter = 'ALL', pointInTime = false) {
  const type = String(row.type || '').toUpperCase()
  const cpu = Number(cpuValue(row, pointInTime) || 0)
  const memory = Number(memoryValue(row, pointInTime) || 0)
  const dState = Number(pointInTime ? row.targetDState : row.dStateHits || 0)
  if (filter === 'BTC') return type === 'BTC'
  if (filter === 'DIA') return type === 'DIA'
  if (filter === 'HIGH_CPU') return cpu >= 80
  if (filter === 'HIGH_MEMORY') return memory >= 2
  if (filter === 'D_STATE') return dState > 0
  if (filter === 'ERROR') return hasError(row)
  return true
}

const QUICK_FILTERS = [
  ['ALL', 'All'],
  ['BTC', 'Background Jobs'],
  ['DIA', 'Dialog'],
  ['HIGH_CPU', 'High CPU'],
  ['HIGH_MEMORY', 'High Memory'],
  ['D_STATE', 'D-State'],
  ['ERROR', 'Error'],
]

export default function VirtualResourceTableV14({ rows = [], selectedKey = '', onSelect, pointInTime = false, initialSortId = 'cpuValue', sortResetKey = '' }) {
  const normalizedSortId = ['cpuValue', 'memory', 'dState'].includes(initialSortId) ? initialSortId : 'cpuValue'
  const [sorting, setSorting] = React.useState([{ id: normalizedSortId, desc: true }])
  const [globalFilter, setGlobalFilter] = React.useState('')
  const [quickFilter, setQuickFilter] = React.useState('ALL')

  React.useEffect(() => {
    setSorting([{ id: normalizedSortId, desc: true }])
    setQuickFilter('ALL')
  }, [pointInTime, normalizedSortId, sortResetKey])

  const filteredRows = React.useMemo(() => rows.filter((row) => quickFilterMatch(row, quickFilter, pointInTime)), [rows, quickFilter, pointInTime])
  const columns = React.useMemo(() => [
    { accessorKey: 'host', header: 'Server', size: 128 },
    { accessorKey: 'workload', header: 'Job Name or ABAP Program', size: 300 },
    { accessorKey: 'type', header: 'WP Type', size: 88, cell: ({ getValue }) => getValue() || '—' },
    { id: 'cpuValue', accessorFn: (row) => cpuValue(row, pointInTime) ?? -1, header: pointInTime ? 'CPU' : 'Peak CPU', size: 92, cell: ({ row }) => hasMetric(cpuValue(row.original, pointInTime)) ? `${fmt(cpuValue(row.original, pointInTime), 1)}%` : '—' },
    { id: 'memory', accessorFn: (row) => memoryValue(row, pointInTime) ?? -1, header: pointInTime ? 'Memory' : 'Peak Memory', size: 145, cell: ({ row }) => memoryText(row.original, pointInTime) },
    { id: 'dState', accessorFn: (row) => Number(pointInTime ? row.targetDState : row.dStateHits || 0), header: pointInTime ? 'D-State WP' : 'D-State Hits', size: 105, cell: ({ row }) => blockingText(row.original, pointInTime) },
    { id: 'finding', accessorFn: (row) => findingText(row, pointInTime), header: 'Finding', size: 185, cell: ({ row }) => <b className={`logV2Finding ${findingText(row.original, pointInTime).toLowerCase().replaceAll(' ', '-').replaceAll('·', '')}`}>{findingText(row.original, pointInTime)}</b> },
    { id: 'observed', accessorFn: (row) => pointInTime ? row.targetTime || '' : row.presenceCount || 0, header: pointInTime ? 'Sample Time' : 'Observed', size: 140, cell: ({ row }) => observedText(row.original, pointInTime) },
  ], [pointInTime])

  const table = useReactTable({
    data: filteredRows,
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
      return [item.host, item.workload, item.program, item.type, item.wchanClass, item.targetWchan, item.errorState, item.errorTaxonomy?.strongest?.category, ...(item.errors || [])].join(' ').toLowerCase().includes(needle)
    },
  })

  const bodyRef = React.useRef(null)
  const tableRows = table.getRowModel().rows
  const activeSortId = sorting[0]?.id || normalizedSortId
  const activeSortLabel = activeSortId === 'memory' ? (pointInTime ? 'Memory' : 'Peak memory') : activeSortId === 'dState' ? (pointInTime ? 'D-State' : 'D-State hits') : (pointInTime ? 'CPU' : 'Peak CPU')
  const activeSortArrow = sorting[0]?.desc === false ? '↑' : '↓'
  const virtualizer = useVirtualizer({ count: tableRows.length, getScrollElement: () => bodyRef.current, estimateSize: () => 42, overscan: 12 })
  const gridTemplate = '128px minmax(300px,1.8fr) 88px 92px 145px 105px 185px 140px'
  const minWidth = 1183

  return <div className="logV2TableShell">
    <div className="logV2TableToolbar logV2BasisToolbar">
      <input value={globalFilter ?? ''} onChange={(event) => setGlobalFilter(event.target.value)} placeholder="Search server, job, program, WP type…" />
      <div className="logV2QuickFilters">{QUICK_FILTERS.map(([key, label]) => <button key={key} type="button" className={quickFilter === key ? 'active' : ''} onClick={() => setQuickFilter(key)}>{label}</button>)}</div>
      <span className="logV2TableMeta"><b>{tableRows.length}</b><em>rows</em><strong>{activeSortLabel} {activeSortArrow}</strong></span>
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

// Test-only helper export intentionally shares this component module.
// eslint-disable-next-line react-refresh/only-export-components
export const __test = { confidenceText, errorText, timingSuffix, errorTone, findingText, quickFilterMatch }
