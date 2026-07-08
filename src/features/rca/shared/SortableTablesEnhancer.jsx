import React from 'react'
import './SortableTablesEnhancer.css'

function normalizeCellValue(value = '') {
  const raw = String(value || '').trim()
  if (!raw) return { type: 'empty', value: '' }

  const percent = raw.match(/^[-+]?\d+(?:\.\d+)?\s*%$/)
  if (percent) return { type: 'number', value: Number(raw.replace('%', '').trim()) }

  const gb = raw.match(/^[-+]?\d+(?:\.\d+)?\s*(GB|G)$/i)
  if (gb) return { type: 'number', value: Number(raw.replace(/(GB|G)/i, '').trim()) }

  const mb = raw.match(/^[-+]?\d+(?:\.\d+)?\s*(MB|M)$/i)
  if (mb) return { type: 'number', value: Number(raw.replace(/(MB|M)/i, '').trim()) / 1024 }

  const sec = raw.match(/^[-+]?\d+(?:\.\d+)?\s*s$/i)
  if (sec) return { type: 'number', value: Number(raw.replace(/s/i, '').trim()) }

  const numeric = raw.replace(/,/g, '')
  if (/^[-+]?\d+(?:\.\d+)?$/.test(numeric)) return { type: 'number', value: Number(numeric) }

  const hhmm = raw.match(/^(\d{1,2}):(\d{2})$/)
  if (hhmm) return { type: 'number', value: Number(hhmm[1]) * 60 + Number(hhmm[2]) }

  return { type: 'text', value: raw.toLowerCase() }
}

function compareValues(aText, bText, direction) {
  const a = normalizeCellValue(aText)
  const b = normalizeCellValue(bText)
  const multiplier = direction === 'desc' ? -1 : 1

  if (a.type === 'empty' && b.type !== 'empty') return 1
  if (b.type === 'empty' && a.type !== 'empty') return -1
  if (a.type === 'number' && b.type === 'number') return (a.value - b.value) * multiplier
  return String(a.value).localeCompare(String(b.value), undefined, { numeric: true, sensitivity: 'base' }) * multiplier
}

function enhanceTable(table) {
  if (!table || table.dataset.sortEnhanced === 'true') return
  const headers = Array.from(table.querySelectorAll('thead th'))
  const tbody = table.querySelector('tbody')
  if (!headers.length || !tbody) return

  table.dataset.sortEnhanced = 'true'
  table.classList.add('sortableEvidenceTable')

  headers.forEach((th, index) => {
    th.classList.add('sortableHeader')
    th.tabIndex = 0
    th.setAttribute('role', 'button')
    th.setAttribute('aria-sort', 'none')
    th.title = 'Click to sort ascending/descending'

    const applySort = () => {
      const currentDirection = th.dataset.sortDirection === 'asc' ? 'desc' : 'asc'
      headers.forEach((item) => {
        item.dataset.sortDirection = ''
        item.setAttribute('aria-sort', 'none')
      })
      th.dataset.sortDirection = currentDirection
      th.setAttribute('aria-sort', currentDirection === 'asc' ? 'ascending' : 'descending')

      const rows = Array.from(tbody.querySelectorAll('tr'))
      rows.sort((rowA, rowB) => {
        const cellA = rowA.children[index]?.innerText || ''
        const cellB = rowB.children[index]?.innerText || ''
        return compareValues(cellA, cellB, currentDirection)
      })
      rows.forEach((row) => tbody.appendChild(row))
    }

    th.addEventListener('click', applySort)
    th.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      applySort()
    })
  })
}

function enhanceAllTables() {
  document.querySelectorAll('.rcaFinalTableWrap table').forEach(enhanceTable)
}

export default function SortableTablesEnhancer() {
  React.useEffect(() => {
    enhanceAllTables()
    const observer = new MutationObserver(() => enhanceAllTables())
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  return null
}
