import React from 'react'

function rawValue(column, row) {
  if (column.value) return column.value(row)
  return row?.[column.key]
}

function compareValues(a, b) {
  const an = typeof a === 'number' ? a : Number(a)
  const bn = typeof b === 'number' ? b : Number(b)
  if (Number.isFinite(an) && Number.isFinite(bn) && String(a).trim() !== '' && String(b).trim() !== '') return an - bn
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' })
}

function filterOptions(rows, filter) {
  if (filter.options) return filter.options
  const values = new Set()
  rows.forEach((row) => {
    const value = filter.value ? filter.value(row) : row?.[filter.key]
    if (Array.isArray(value)) value.forEach((item) => item && values.add(String(item)))
    else if (value !== undefined && value !== null && String(value) !== '') values.add(String(value))
  })
  return Array.from(values).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

function repeatedNewErrorSnapshots(row = {}) {
  const newErrors = new Set((row.newErrors || []).filter(Boolean))
  if (!newErrors.size) return 0
  const occurrences = new Set()
  ;(row.records || []).forEach((record) => {
    const code = record?.errorCode
    if (!newErrors.has(code)) return
    occurrences.add(`${code}|${record?.timeLabel || record?.snapshot || ''}`)
  })
  return occurrences.size
}

function isEvidenceCandidate(row) {
  const score = Number(row?.anomalyScore || 0)
  if (score >= 60) return true
  if (score < 40) return false

  const dStateIncrease = Number(row?.dStateIncrease || 0)
  const cpuIncrease = Number(row?.cpuDelta || 0)
  const rssIncrease = Number(row?.rssDelta || 0)
  const repeatedNewError = repeatedNewErrorSnapshots(row) >= 2

  return dStateIncrease > 0 || cpuIncrease >= 5 || rssIncrease >= 1 || repeatedNewError
}

export default function RcaDataTable({
  columns = [], rows = [], rowKey = (row, index) => row?.key || row?.id || index,
  defaultSort = null, search = true, searchPlaceholder = 'Search…', filters = [], pageSize = 50,
  compact = false, className = '', onRowClick, selectedKey = '', query: controlledQuery, onQueryChange,
  emptyText = 'No matching rows.', onViewChange,
}) {
  const [internalQuery, setInternalQuery] = React.useState('')
  const query = controlledQuery !== undefined ? controlledQuery : internalQuery
  const setQuery = onQueryChange || setInternalQuery
  const [sort, setSort] = React.useState(defaultSort)
  const [filterState, setFilterState] = React.useState({})
  const [page, setPage] = React.useState(1)
  const [evidenceScope, setEvidenceScope] = React.useState('candidates')
  const lastViewSignature = React.useRef('')

  const hasEvidenceScore = columns.some((column) => column.key === 'anomalyScore')
  const supportsEvidenceScope = search && String(searchPlaceholder || '').startsWith('Search workload, host, program') && rows.length > 20
  const compactCandidateReport = compact && !search && hasEvidenceScore
  const deferredQuery = React.useDeferredValue(query)
  const deferredFilterState = React.useDeferredValue(filterState)
  const deferredSort = React.useDeferredValue(sort)
  const deferredEvidenceScope = React.useDeferredValue(evidenceScope)
  const pending = deferredQuery !== query || deferredFilterState !== filterState || deferredSort !== sort || deferredEvidenceScope !== evidenceScope

  React.useEffect(() => { setPage(1) }, [query, filterState, rows, evidenceScope])

  const evidenceRows = React.useMemo(() => {
    if (compactCandidateReport) return rows.filter(isEvidenceCandidate)
    if (!supportsEvidenceScope || deferredEvidenceScope === 'all') return rows
    return rows.filter(isEvidenceCandidate)
  }, [rows, supportsEvidenceScope, compactCandidateReport, deferredEvidenceScope])

  const availableFilterOptions = React.useMemo(() => {
    const options = new Map()
    filters.forEach((filter) => options.set(filter.key, filterOptions(evidenceRows, filter)))
    return options
  }, [evidenceRows, filters])

  const filtered = React.useMemo(() => {
    const needle = String(deferredQuery || '').trim().toLowerCase()
    return evidenceRows.filter((row) => {
      if (needle) {
        const haystack = columns.filter((column) => column.searchable !== false).map((column) => rawValue(column, row)).flat().join(' ').toLowerCase()
        if (!haystack.includes(needle)) return false
      }
      for (const filter of filters) {
        const selected = deferredFilterState[filter.key]
        if (!selected || selected === '__all__') continue
        const value = filter.value ? filter.value(row) : row?.[filter.key]
        if (Array.isArray(value)) {
          if (!value.map(String).includes(selected)) return false
        } else if (String(value ?? '') !== selected) return false
      }
      return true
    })
  }, [evidenceRows, deferredQuery, columns, filters, deferredFilterState])

  const sorted = React.useMemo(() => {
    if (!deferredSort?.key) return filtered
    const column = columns.find((item) => item.key === deferredSort.key)
    if (!column) return filtered
    return [...filtered].sort((a, b) => {
      const result = compareValues(rawValue(column, a), rawValue(column, b))
      return deferredSort.dir === 'asc' ? result : -result
    })
  }, [filtered, deferredSort, columns])

  const viewSignature = React.useMemo(() => sorted.map((row, index) => String(rowKey(row, index))).join('|'), [sorted, rowKey])
  React.useEffect(() => {
    if (!onViewChange || viewSignature === lastViewSignature.current) return
    lastViewSignature.current = viewSignature
    onViewChange(sorted)
  }, [viewSignature, onViewChange, sorted])

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, pages)
  const start = (safePage - 1) * pageSize
  const visible = compact ? sorted : sorted.slice(start, start + pageSize)

  const toggleSort = (column) => {
    if (column.sortable === false) return
    const fallback = defaultSort
    if (sort?.key !== column.key) return setSort({ key: column.key, dir: column.defaultDir || (column.num ? 'desc' : 'asc') })
    if (sort.dir === 'desc') return setSort({ key: column.key, dir: 'asc' })
    if (fallback?.key === column.key && fallback?.dir === 'asc') return setSort(null)
    setSort(fallback?.key ? fallback : null)
  }

  const hasToolbar = search || filters.length > 0 || supportsEvidenceScope
  return <div className={`rca26DataTable ${className}`} aria-busy={pending ? 'true' : 'false'} data-pending={pending ? 'true' : 'false'}>
    {hasToolbar && <div className="rca26TableToolbar">
      {search && <input className="rca26Search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder} />}
      {supportsEvidenceScope && <div className="rca26EvidenceScope" role="group" aria-label="Workload evidence scope" data-pdf-ignore="true" title="Candidates: score 60+, or score 40–59 with D-state increase, significant CPU/RSS increase, or a new error repeated across timestamps."><button type="button" data-active={evidenceScope === 'candidates'} onClick={() => setEvidenceScope('candidates')}>RCA Candidates</button><button type="button" data-active={evidenceScope === 'all'} onClick={() => setEvidenceScope('all')}>All Workloads</button></div>}
      {filters.map((filter) => <label className="rca26Filter" key={filter.key}><span>{filter.label}</span><select value={filterState[filter.key] || '__all__'} onChange={(event) => setFilterState((current) => ({ ...current, [filter.key]: event.target.value }))}><option value="__all__">All</option>{(availableFilterOptions.get(filter.key) || []).map((option) => <option value={option} key={option}>{option}</option>)}</select></label>)}
      {(query || Object.values(filterState).some((value) => value && value !== '__all__')) && <button className="rca26TextBtn" onClick={() => { setQuery(''); setFilterState({}) }}>Clear</button>}
      <span className="rca26ResultCount">{supportsEvidenceScope && evidenceScope === 'candidates' ? `${sorted.length.toLocaleString()} of ${rows.length.toLocaleString()} rows` : `${sorted.length.toLocaleString()} rows`}</span>
    </div>}
    <div className={`rca26TableWrap ${compact ? 'short' : ''}`}>
      <table className={`rca26Table ${onRowClick ? 'selectable' : ''}`}>
        <thead><tr>{columns.map((column) => {
          const active = sort?.key === column.key
          return <th key={column.key} className={column.num ? 'num' : ''} data-sortable={column.sortable !== false} onClick={() => toggleSort(column)}>{column.label}<span className="rca26SortMark">{active ? (sort.dir === 'desc' ? '↓' : '↑') : ''}</span></th>
        })}</tr></thead>
        <tbody>{visible.map((row, index) => {
          const key = rowKey(row, start + index)
          return <tr key={key} data-selected={String(key) === String(selectedKey)} onClick={() => onRowClick?.(row)}>{columns.map((column) => <td key={column.key} className={column.num ? 'num' : ''}>{column.render ? column.render(row) : String(rawValue(column, row) ?? '—')}</td>)}</tr>
        })}{!visible.length && <tr><td className="rca26NoRows" colSpan={columns.length}>{emptyText}</td></tr>}</tbody>
      </table>
    </div>
    {!compact && sorted.length > pageSize && <div className="rca26Pager"><span>{start + 1}–{Math.min(start + pageSize, sorted.length)} of {sorted.length.toLocaleString()}</span><button disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>‹</button><span>Page {safePage} / {pages}</span><button disabled={safePage >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}>›</button></div>}
  </div>
}
