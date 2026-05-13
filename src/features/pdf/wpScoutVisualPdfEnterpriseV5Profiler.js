const nowMs = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now()
  return Date.now()
}

export function createWpScoutPdfProfiler() {
  const startedAt = nowMs()
  const sections = []

  return {
    timeSection(section, render) {
      const start = nowMs()
      try {
        return render()
      } finally {
        const durationMs = Math.max(0, Math.round(nowMs() - start))
        sections.push({
          id: section?.id || 'unknown',
          title: section?.title || 'Unknown Section',
          page: section?.page || '-',
          durationMs,
        })
      }
    },
    snapshot() {
      const totalMs = Math.max(0, Math.round(nowMs() - startedAt))
      const slowest = [...sections].sort((a, b) => b.durationMs - a.durationMs)[0] || null
      return {
        totalMs,
        sections: [...sections],
        slowest,
        sectionCount: sections.length,
      }
    },
  }
}

export function shouldShowWpScoutPdfProfiler(profile, telemetry) {
  const requested = profile?.id === 'full'
  const slowExport = Number(telemetry?.totalMs || 0) >= 1500
  return requested || slowExport
}
