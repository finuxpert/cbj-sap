import React from 'react'
import './SortableTablesEnhancer.css'

const LOG_CACHE_KEY = 'sap_log_evidence_v2_cache'

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

function readLogCache() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOG_CACHE_KEY) || 'null')
    return Array.isArray(parsed?.rows) ? parsed.rows : []
  } catch (_error) {
    return []
  }
}

function tableTitle(table) {
  return table.closest('.rcaFinalTableCard, .rcaFinalCard')?.querySelector('.rcaFinalPanelTitle h2, h2')?.textContent?.trim() || ''
}

function headerIndex(table, label) {
  const headers = Array.from(table.querySelectorAll('thead th'))
  return headers.findIndex((th) => th.textContent.trim().toLowerCase() === label.toLowerCase())
}

function insertHeaderAfter(table, afterLabel, label) {
  if (headerIndex(table, label) >= 0) return headerIndex(table, label)
  const headRow = table.querySelector('thead tr')
  if (!headRow) return -1
  const th = document.createElement('th')
  th.textContent = label
  const afterIdx = headerIndex(table, afterLabel)
  const afterNode = afterIdx >= 0 ? headRow.children[afterIdx] : null
  if (afterNode?.nextSibling) headRow.insertBefore(th, afterNode.nextSibling)
  else headRow.appendChild(th)
  return headerIndex(table, label)
}

function insertCellAfter(row, afterIdx, value) {
  const td = document.createElement('td')
  td.textContent = value
  if (row.children[afterIdx]?.nextSibling) row.insertBefore(td, row.children[afterIdx].nextSibling)
  else row.appendChild(td)
}

function uniqueJoined(values = [], limit = 4) {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean))).slice(0, limit).join(' · ') || '-'
}

function formatGb(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? `${Number(number.toFixed(1))} GB` : '-'
}

function formatMemPct(row) {
  const rss = Number(row?.rssGb) || 0
  const total = Number(row?.physicalMemGb) || 0
  if (!rss || !total) return '-'
  return `${Number(((rss / total) * 100).toFixed(1))}%`
}

function augmentJobProgramTable(table, rows) {
  if (table.dataset.pidAugmented === 'true') return
  if (!tableTitle(table).toLowerCase().includes('job / program mapping')) return
  const jobIdx = headerIndex(table, 'Job Name')
  if (jobIdx < 0) return

  insertHeaderAfter(table, 'Job Name', 'PID')
  const pidMap = new Map()
  rows.forEach((row) => {
    const job = String(row.jobName || '').trim()
    if (!job || job === '?') return
    const current = pidMap.get(job) || []
    if (row.pid) current.push(row.pid)
    pidMap.set(job, current)
  })

  Array.from(table.querySelectorAll('tbody tr')).forEach((tr) => {
    if (tr.dataset.pidAugmented === 'true') return
    const job = tr.children[jobIdx]?.textContent?.trim() || ''
    insertCellAfter(tr, jobIdx, uniqueJoined(pidMap.get(job) || [], 6))
    tr.dataset.pidAugmented = 'true'
  })

  table.dataset.pidAugmented = 'true'
  table.dataset.sortEnhanced = ''
}

function augmentLongRunningTable(table, rows) {
  if (table.dataset.memAugmented === 'true') return
  if (!tableTitle(table).toLowerCase().includes('long running work process')) return

  const timeIdx = headerIndex(table, 'Time')
  const hostIdx = headerIndex(table, 'APP Server')
  const pidIdx = headerIndex(table, 'PID')
  const wpIdx = headerIndex(table, 'WP')
  const cpuIdx = headerIndex(table, 'CPU %')
  if ([timeIdx, hostIdx, pidIdx, wpIdx, cpuIdx].some((idx) => idx < 0)) return

  insertHeaderAfter(table, 'CPU %', 'RSS GB')
  insertHeaderAfter(table, 'RSS GB', 'MEM %')

  Array.from(table.querySelectorAll('tbody tr')).forEach((tr) => {
    if (tr.dataset.memAugmented === 'true') return
    const time = tr.children[timeIdx]?.textContent?.trim() || ''
    const host = tr.children[hostIdx]?.textContent?.trim() || ''
    const pid = tr.children[pidIdx]?.textContent?.trim() || ''
    const wp = tr.children[wpIdx]?.textContent?.trim() || ''
    const sourceRow = rows.find((row) => String(row.timeLabel || '') === time && String(row.host || '') === host && String(row.pid || '') === pid && String(row.wp || '') === wp)
    insertCellAfter(tr, cpuIdx, formatGb(sourceRow?.rssGb))
    insertCellAfter(tr, cpuIdx + 1, formatMemPct(sourceRow))
    tr.dataset.memAugmented = 'true'
  })

  table.dataset.memAugmented = 'true'
  table.dataset.sortEnhanced = ''
}

function augmentEvidenceTables() {
  const rows = readLogCache()
  if (!rows.length) return
  document.querySelectorAll('.rcaFinalTableWrap table').forEach((table) => {
    augmentJobProgramTable(table, rows)
    augmentLongRunningTable(table, rows)
  })
}

function enhanceTable(table) {
  if (!table || table.dataset.sortEnhanced === 'true') return
  const headers = Array.from(table.querySelectorAll('thead th'))
  const tbody = table.querySelector('tbody')
  if (!headers.length || !tbody) return

  table.dataset.sortEnhanced = 'true'
  table.classList.add('sortableEvidenceTable')

  headers.forEach((th, index) => {
    if (th.dataset.sortListener === 'true') return
    th.classList.add('sortableHeader')
    th.tabIndex = 0
    th.setAttribute('role', 'button')
    th.setAttribute('aria-sort', 'none')
    th.title = 'Click to sort ascending/descending'
    th.dataset.sortListener = 'true'

    const applySort = () => {
      const currentDirection = th.dataset.sortDirection === 'asc' ? 'desc' : 'asc'
      headers.forEach((item) => {
        item.dataset.sortDirection = ''
        item.setAttribute('aria-sort', 'none')
      })
      th.dataset.sortDirection = currentDirection
      th.setAttribute('aria-sort', currentDirection === 'asc' ? 'ascending' : 'descending')

      const bodyRows = Array.from(tbody.querySelectorAll('tr'))
      bodyRows.sort((rowA, rowB) => {
        const cellA = rowA.children[index]?.innerText || ''
        const cellB = rowB.children[index]?.innerText || ''
        return compareValues(cellA, cellB, currentDirection)
      })
      bodyRows.forEach((row) => tbody.appendChild(row))
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
  augmentEvidenceTables()
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
