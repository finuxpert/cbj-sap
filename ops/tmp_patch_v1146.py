from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if new in text and old not in text:
        return
    if old not in text:
        raise SystemExit(f"Expected snippet not found in {path}: {old[:160]!r}")
    p.write_text(text.replace(old, new, 1))


tool = 'src/tools/ToolLogAutoRcaV5.jsx'
table = 'src/tools/components/VirtualResourceTableV14.jsx'
chart = 'src/tools/components/LogLandscapeEChart.jsx'
css = 'src/tools/LogAutoRcaV141.css'
version = 'src/app/version.js'

replace_once(
    tool,
    "return <span className={`logV141Decision ${confirmed ? 'confirmed' : 'unconfirmed'}`}>{confirmed ? 'IDENTIFIED' : 'UNRESOLVED'}</span>",
    "return <span className={`logV141Decision ${confirmed ? 'confirmed' : 'unconfirmed'}`}>{confirmed ? 'IDENTIFIED' : 'RCA OPEN'}</span>",
)

replace_once(
    tool,
    "function WorkloadDetail({ item }) {\n  if (!item) return null\n  const taxonomy = item.errorTaxonomy || {}",
    "function WorkloadDetail({ item, capabilities }) {\n  if (!item) return null\n  const enhancedDetailsAvailable = capabilities?.mode !== 'LEGACY'\n  const taxonomy = item.errorTaxonomy || {}",
)

replace_once(
    tool,
    "<div><dt>Workload role</dt><dd>{operatorLabel(item.incidentRole)}</dd></div><div><dt>Time match</dt><dd>{humanize(item.targetEvidence)} · {signed(item.targetDeltaMinutes, 0, 'm')}</dd></div>",
    "<div><dt>Workload role</dt><dd>{operatorLabel(item.incidentRole)}</dd></div><div><dt>Time match</dt><dd>{item.targetEvidence === 'EXACT_TARGET' ? 'At incident time' : `${humanize(item.targetEvidence)} · ${signed(item.targetDeltaMinutes, 0, ' min')}`}</dd></div>",
)

old_detail = """        <div><dt>PSS</dt><dd>{metricText(item.targetPssGb, 2, ' GB')}</dd></div><div><dt>PSS baseline</dt><dd>{metricText(item.pssBaseline?.median, 2, ' GB')} · z {robustZText(item.pssUplift?.z)}</dd></div>
        <div><dt>Private memory</dt><dd>{metricText(item.targetPrivateGb, 2, ' GB')}</dd></div><div><dt>Σ shared mappings</dt><dd>{metricText(item.targetSharedGb, 2, ' GB')} · non-exclusive</dd></div>
        <div><dt>Max PID RSS</dt><dd>{metricText(item.targetMaxPidRss, 2, ' GB')}</dd></div><div><dt>D-state and PIDs</dt><dd>{hasMetric(item.targetDState) ? `${item.targetDState} / ${item.targetConcurrentPids}` : '—'}</dd></div>
        <div><dt>Kernel wait</dt><dd>{operatorLabel(item.wchanClass || 'NONE')} · {item.targetWchan || '—'}{item.wchanScope === 'D_STATE' ? ' · D-state first' : ''}</dd></div><div><dt>Metric sample time</dt><dd>{humanize(item.enhancedEvidenceQuality || 'UNAVAILABLE')}{hasMetric(item.enhancedEvidenceDeltaMinutes) ? ` · ${item.enhancedEvidenceDeltaMinutes} min` : ''}</dd></div>
        <div><dt>Average read rate</dt><dd>{metricText(item.targetReadMiBps, 2, ' MiB/s')} {hasMetric(item.targetIoWindowMinutes) ? `· ${fmt(item.targetIoWindowMinutes, 0)} min window` : ''}</dd></div><div><dt>Average write rate</dt><dd>{metricText(item.targetWriteMiBps, 2, ' MiB/s')} {hasMetric(item.targetIoWindowMinutes) ? `· ${fmt(item.targetIoWindowMinutes, 0)} min window` : ''}</dd></div>
        <div><dt>Host iowait</dt><dd>{metricText(item.hostIowaitPct, 1, '%')}</dd></div><div><dt>PSI memory and I/O full10</dt><dd>{metricText(item.hostPsiMemoryFull10, 1, '%')} / {metricText(item.hostPsiIoFull10, 1, '%')}</dd></div>"""
new_detail = """        <div><dt>Max PID RSS</dt><dd>{metricText(item.targetMaxPidRss, 2, ' GB')}</dd></div><div><dt>D-state and PIDs</dt><dd>{hasMetric(item.targetDState) ? `${item.targetDState} of ${item.targetConcurrentPids}` : '—'}</dd></div>
        {!enhancedDetailsAvailable && <div className=\"wide logV146StandardNote\"><dt>Additional Linux metrics</dt><dd>Not available in standard logs</dd></div>}
        {enhancedDetailsAvailable && <>
          <div><dt>PSS</dt><dd>{metricText(item.targetPssGb, 2, ' GB')}</dd></div><div><dt>PSS baseline</dt><dd>{metricText(item.pssBaseline?.median, 2, ' GB')} · z {robustZText(item.pssUplift?.z)}</dd></div>
          <div><dt>Private memory</dt><dd>{metricText(item.targetPrivateGb, 2, ' GB')}</dd></div><div><dt>Shared memory mappings</dt><dd>{metricText(item.targetSharedGb, 2, ' GB')} · non-exclusive</dd></div>
          <div><dt>Kernel wait</dt><dd>{operatorLabel(item.wchanClass || 'NONE')} · {item.targetWchan || '—'}{item.wchanScope === 'D_STATE' ? ' · D-state first' : ''}</dd></div><div><dt>Metric sample time</dt><dd>{humanize(item.enhancedEvidenceQuality || 'UNAVAILABLE')}{hasMetric(item.enhancedEvidenceDeltaMinutes) ? ` · ${item.enhancedEvidenceDeltaMinutes} min` : ''}</dd></div>
          <div><dt>Average read rate</dt><dd>{metricText(item.targetReadMiBps, 2, ' MiB/s')} {hasMetric(item.targetIoWindowMinutes) ? `· ${fmt(item.targetIoWindowMinutes, 0)} min window` : ''}</dd></div><div><dt>Average write rate</dt><dd>{metricText(item.targetWriteMiBps, 2, ' MiB/s')} {hasMetric(item.targetIoWindowMinutes) ? `· ${fmt(item.targetIoWindowMinutes, 0)} min window` : ''}</dd></div>
          <div><dt>Host iowait</dt><dd>{metricText(item.hostIowaitPct, 1, '%')}</dd></div><div><dt>PSI memory and I/O full10</dt><dd>{metricText(item.hostPsiMemoryFull10, 1, '%')} / {metricText(item.hostPsiIoFull10, 1, '%')}</dd></div>
        </>}"""
replace_once(tool, old_detail, new_detail)

replace_once(
    tool,
    "setStatus(`${expanded.length} files · ${nextRca.collections.length} collections · ${nextRca.hosts.length} application servers · rejects ${rejected} · source-host ${sourceStatus} · telemetry ${caps.mode}`)",
    "setStatus(`${expanded.length} files · ${nextRca.collections.length} snapshots · ${nextRca.hosts.length} application servers · rejects ${rejected} · source-host ${sourceStatus} · data source ${dataSourcePresentation(caps).label}`)",
)

replace_once(
    tool,
    "{!ranking && <WorkloadDetail item={selectedResource} />}",
    "{!ranking && <WorkloadDetail item={selectedResource} capabilities={capabilities} />}",
)

replace_once(
    table,
    "if (hasMetric(row.targetDState) && Number(row.targetDState) > 0) return `D ${row.targetDState}/${row.targetConcurrentPids || 0}`",
    "if (hasMetric(row.targetDState) && Number(row.targetDState) > 0) return `${row.targetDState} of ${row.targetConcurrentPids || 0} D-state`",
)

replace_once(
    chart,
    "CPU Σ ${cpu}<br/>Max PID RSS ${maxPidRss}<br/>ΣRSS upper bound ${rss}<br/>",
    "CPU Σ ${cpu}<br/>Max PID RSS ${maxPidRss}<br/>Total RSS (upper bound) ${rss}<br/>",
)
replace_once(
    chart,
    "{ name: 'ΣRSS upper bound', type: 'line'",
    "{ name: 'Total RSS (upper bound)', type: 'line'",
)

p = Path(css)
text = p.read_text()
css_patch = """
/* v1.14.6: standard-mode operator cleanup */
.logV141SummaryGrid>div:nth-child(2) strong{white-space:normal;overflow:visible;text-overflow:clip;line-height:1.3}
.logV146StandardNote dd{color:#80949a}
"""
if 'v1.14.6: standard-mode operator cleanup' not in text:
    p.write_text(text.rstrip() + '\n' + css_patch)

replace_once(version, "export const APP_VERSION = '1.14.5'", "export const APP_VERSION = '1.14.6'")
replace_once(
    version,
    "export const LOG_UI_REVISION = 'operator-console-plain-language-v3.6.5'",
    "export const LOG_UI_REVISION = 'standard-mode-ux-cleanup-v3.6.6'",
)
