export function buildTimeline(rows = []) {
  const timelineMap = new Map()
  rows.forEach((row) => {
    if (!row.timeLabel) return
    const current = timelineMap.get(row.timeLabel) || { time: row.timeLabel, hits: 0, crit: 0, warn: 0 }
    current.hits += 1
    current.crit += row.className === 'CRIT' ? 1 : 0
    current.warn += row.className === 'WARN' ? 1 : 0
    timelineMap.set(row.timeLabel, current)
  })
  return Array.from(timelineMap.values()).sort((a, b) => String(a.time).localeCompare(String(b.time)))
}
