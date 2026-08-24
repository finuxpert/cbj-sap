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
  const lastViewSignature = React.useRef('')

  React.useEffect(() => { setPage(1) }, [query, filterState, rows])

  const filtered = React.useMemo(() => {
    const needle = String(query || '').trim().toLowerCase()
    return rows.filter((row) => {
      if (needle) {
        const haystack = columns.filter((column) => column.searchable !== false).map((column) => rawValue(column, row)).flat().join(' ').toLowerCase()
        if (!haystack.includes(needle)) return false
      }
      for (const filter of filters) {
        const selected = filterState[filter.key]
        if (!selected || selected === '__all__') continue
        const value = filter.value ? filter.value(row) : row?.[filter.key]
        if (Array.isArray(value)) {
          if (!value.map(String).includes(selected)) return false
        } else if (String(value ?? '') !== selected) return false
      }
      return true
    })
  }, [rows, query, columns, filters, filterState])

  const sorted = React.useMemo(() => {
    if (!sort?.key) return filtered
    const column = columns.find((item) => item.key === sort.key)
    if (!column) return filtered
    return [...filtered].sort((a, b) => {
      const result = compareValues(rawValue(column, a), rawValue(column, b))
      return sort.dir === 'asc' ? result : -result
    })
  }, [filtered, sort, columns])

  const viewSignature = sorted.map((row, index) => String(rowKey(row, index))).join('|')
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

  const hasToolbar = search || filters.length > 0
  return <div className={`rca26DataTable ${className}`}>
    {hasToolbar && <div className="rca26TableToolbar">
      {search && <input className="rca26Search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder} />}
      {filters.map((filter) => <label className="rca26Filter" key={filter.key}><span>{filter.label}</span><select value={filterState[filter.key] || '__all__'} onChange={(event) => setFilterState((current) => ({ ...current, [filter.key]: event.target.value }))}><option value="__all__">All</option>{filterOptions(rows, filter).map((option) => <option value={option} key={option}>{option}</option>)}</select></label>)}
      {(query || Object.values(filterState).some((value) => value && value !== '__all__')) && <button className="rca26TextBtn" onClick={() => { setQuery(''); setFilterState({}) }}>Clear</button>}
      <span className="rca26ResultCount">{sorted.length.toLocaleString()} rows</span>
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
