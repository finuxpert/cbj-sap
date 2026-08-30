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
  if (value === 'NEAR_TARGET') return 'NEAR'
  if (value === 'EARLY_TARGET') return 'EARLY'
  if (value === 'LATE_TARGET') return 'LATE'
  if (value === 'OFF_TARGET') return 'OFF'
  if (value === 'ADJACENT_TARGET') return 'ADJACENT'
  return 'NONE'
}

function VerdictBanner({ rows }) {
  const verdict = rows?.verdict
  if (!verdict) return null
  const established = verdict.status === 'SINGLE_CULPRIT_SUPPORTED'
  const landscape = verdict.landscapeConfidence || rows?.landscapeConfidence || {}
  return <div className="logV2Method" style={{ marginBottom: 12 }}>
    <b>RCA Verdict:</b> {established ? ' SINGLE CULPRIT SUPPORTED' : ' NO SINGLE CULPRIT'} · pattern <b>{verdict.pattern}</b> · anchor <b>{verdict.anchorHost || '—'} @ {verdict.anchorTime || '—'}</b> · landscape confidence <b>{landscape.grade || '—'} {hasMetric(landscape.score) ? `${fmt(landscape.score, 0)}/100` : ''}</b>.
    {' '}{verdict.interpretation}
    {verdict.topWorkload ? <> Top related workload: <b>{verdict.topWorkload}</b> ({verdict.topHost}) · causal {verdict.topCausalScore}/100 · victim {verdict.topVictimScore}/100 · local confidence {verdict.topLocalConfidence}.</> : null}
  </div>
}

function EngineDiagnostics({ rows }) {
  const diagnostics = rows?.engineDiagnostics
  if (!diagnostics) return null
  return <details className="logV2SourceAudit" style={{ marginBottom: 12 }}>
    <summary>Analytics diagnostics · {diagnostics.activeEngine || 'unknown'} · DuckDB {diagnostics.duckDbStatus || 'UNKNOWN'} · parity {diagnostics.parity?.status || 'NOT_RUN'}</summary>
    <div style={{ padding: 12 }}>
      <b>Active engine:</b> {diagnostics.activeEngine || '—'}<br />
      <b>DuckDB:</b> {diagnostics.duckDbStatus || '—'}<br />
      <b>Reason:</b> {diagnostics.reason || '—'}<br />
      <b>JS ↔ DuckDB parity:</b> {diagnostics.parity?.status || 'NOT_RUN'}{hasMetric(diagnostics.parity?.compared) ? ` · compared ${fmt(diagnostics.parity.compared, 0)}` : ''}{hasMetric(diagnostics.parity?.mismatchCount) ? ` · mismatches ${fmt(diagnostics.parity.mismatchCount, 0)}` : ''}
    </div>
  </details>
}

function cpuShareCell(row) {
  const item = row.original
  if (item.cpuContributionValid === true && hasMetric(item.estimatedCpuSharePct ?? item.cpuContributionPct)) return `${fmt(item.estimatedCpuSharePct ?? item.cpuContributionPct, 1)}%`
  if (item.cpuContributionStatus === 'INCONSISTENT_SCALE') return `rejected scale${hasMetric(item.cpuContributionRawPct) ? ` (${fmt(item.cpuContributionRawPct, 0)}%)` : ''}`
  if (item.cpuContributionStatus === 'TEMPORAL_MISMATCH') return 'not synchronized'
  if (item.cpuContributionStatus === 'UNAVAILABLE_TARGET_CPU') return 'CPU unavailable'
  if (item.cpuContributionStatus === 'UNAVAILABLE_HOST_CPU_SCALE') return 'host scale unavailable'
  return '—'
}

export default function VirtualResourceTable({ rows = [], selectedKey = '', onSelect }) {
  const [sorting, setSorting] = React.useState([{ id: 'causalScore', desc: true }])
  const [globalFilter, setGlobalFilter] = React.useState('')
  const columns = React.useMemo(() => [
    { accessorKey: 'host', header: 'Host', size: 120 },
    { accessorKey: 'workload', header: 'Workload / Job', size: 250 },
    { accessorKey: 'program', header: 'Program', size: 170 },
    { accessorKey: 'incidentRole', header: 'Incident Role', size: 145 },
    { accessorKey: 'causalScore', header: 'Causal Priority', size: 120, cell: ({ getValue }) => <b className="logV2Score">{fmt(getValue(), 0)}</b> },
    { accessorKey: 'incidentScore', header: 'Relevance', size: 90, cell: ({ getValue }) => fmt(getValue(), 0) },
    { accessorKey: 'victimScore', header: 'Victim', size: 82, cell: ({ getValue }) => fmt(getValue(), 0) },
    { id: 'localConfidence', accessorFn: (row) => row.localConfidence?.score ?? 0, header: 'Local Conf.', size: 105, cell: ({ row }) => `${row.original.localConfidence?.grade || '—'} ${hasMetric(row.original.localConfidence?.score) ? fmt(row.original.localConfidence.score, 0) : '—'}` },
    { id: 'landscapeConfidence', accessorFn: (row) => row.landscapeConfidence?.score ?? 0, header: 'Landscape Conf.', size: 120, cell: ({ row }) => `${row.original.landscapeConfidence?.grade || '—'} ${hasMetric(row.original.landscapeConfidence?.score) ? fmt(row.original.landscapeConfidence.score, 0) : '—'}` },
    { accessorKey: 'footprintScore', header: 'Footprint', size: 85, cell: ({ getValue }) => fmt(getValue(), 0) },
    { accessorKey: 'targetHostSeverity', header: 'Host @ Incident', size: 115 },
    { accessorKey: 'targetHostEvidenceSeverity', header: 'Host @ Evidence', size: 115 },
    { accessorKey: 'targetEvidence', header: 'Target Evidence', size: 110, cell: ({ getValue }) => evidenceLabel(getValue()) },
    { accessorKey: 'targetDeltaMinutes', header: 'Δ min', size: 70, cell: ({ getValue }) => hasMetric(getValue()) ? `${Number(getValue()) > 0 ? '+' : ''}${fmt(getValue(), 0)}` : '—' },
    { accessorKey: 'targetCpu', header: 'CPU Σ @ Evidence', size: 120, cell: ({ getValue }) => hasMetric(getValue()) ? `${fmt(getValue(), 1)}%` : '—' },
    { accessorKey: 'targetMaxPidRss', header: 'Max PID RSS @ Evidence', size: 145, cell: ({ getValue }) => hasMetric(getValue()) ? `${fmt(getValue(), 2)} GB` : '—' },
    { id: 'estimatedCpuSharePct', accessorFn: (row) => row.estimatedCpuSharePct ?? -1, header: 'Est. CPU Share', size: 135, cell: ({ row }) => cpuShareCell(row) },
    { accessorKey: 'maxPidRssUsedRamIndicatorPct', header: 'Max PID RSS / Used RAM', size: 155, cell: ({ getValue }) => hasMetric(getValue()) ? `${fmt(getValue(), 1)}%` : '—' },
    { accessorKey: 'targetDState', header: 'D @ Evidence', size: 90 },
    { accessorKey: 'targetConcurrentPids', header: 'PIDs @ Evidence', size: 100 },
    { accessorKey: 'presenceCount', header: 'Observed', size: 78 },
    { accessorKey: 'errorState', header: 'Error Timing', size: 175, cell: ({ getValue }) => <span className={`logV2ErrorState ${toneForError(getValue())}`}>{getValue()}</span> },
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
      return [item.host, item.workload, item.program, item.type, item.incidentRole, item.localConfidence?.grade, item.landscapeConfidence?.grade, item.errorState, item.targetEvidence, item.targetHostSeverity, item.targetHostEvidenceSeverity, item.cpuContributionStatus, ...(item.errors || [])].join(' ').toLowerCase().includes(needle)
    },
  })

  const bodyRef = React.useRef(null)
  const tableRows = table.getRowModel().rows
  const virtualizer = useVirtualizer({ count: tableRows.length, getScrollElement: () => bodyRef.current, estimateSize: () => 42, overscan: 10 })
  const gridTemplate = columns.map((column) => `${column.size || 120}px`).join(' ')

  return <div className="logV2TableShell">
    <VerdictBanner rows={rows} />
    <EngineDiagnostics rows={rows} />
    <div className="logV2TableToolbar">
      <input value={globalFilter ?? ''} onChange={(event) => setGlobalFilter(event.target.value)} placeholder="Search job, role, host, program, error…" />
      <span><b>{tableRows.length}</b> of {rows.length} workloads · primary sort = causal priority · local and landscape confidence are intentionally separate</span>
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
