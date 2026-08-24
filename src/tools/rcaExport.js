export function downloadCsv(filename, columns, rows) {
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const header = columns.map((column) => escape(column.label || column.key)).join(',')
  const body = rows.map((row) => columns.map((column) => {
    const value = column.exportValue ? column.exportValue(row) : column.value ? column.value(row) : row?.[column.key]
    return escape(Array.isArray(value) ? value.join(' | ') : value)
  }).join(',')).join('\n')
  const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
