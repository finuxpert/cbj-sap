import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const write = (path, content) => fs.writeFileSync(path, content)

function replaceOnce(source, search, replacement, label) {
  const next = typeof search === 'string' ? source.replace(search, replacement) : source.replace(search, replacement)
  if (next === source) throw new Error(`Patch target not found: ${label}`)
  return next
}

const toolPath = 'src/tools/ToolLogAutoSphereV5.jsx'
let tool = read(toolPath)

tool = replaceOnce(
  tool,
  "import React from 'react'\n",
  "import React from 'react'\nimport * as Accordion from '@radix-ui/react-accordion'\n",
  'Radix import',
)

const statBlock = `function Stat({ label, value, meta, tone = '' }) {\n  return <article className={\`logV2Stat ${tone}\`}><span>{label}</span><strong>{value}</strong>{meta ? <small>{meta}</small> : null}</article>\n}\n`
const inspectorBlock = `${statBlock}\nfunction InspectorSection({ title, children, defaultOpen = false, className = '' }) {\n  return <Accordion.Root type="single" collapsible defaultValue={defaultOpen ? 'content' : undefined} className={\`logOpsAccordion ${className}\`}>\n    <Accordion.Item value="content" className="logOpsAccordionItem">\n      <Accordion.Header className="logOpsAccordionHeader">\n        <Accordion.Trigger className="logOpsAccordionTrigger">\n          <span>{title}</span><span className="logOpsAccordionChevron" aria-hidden="true">⌄</span>\n        </Accordion.Trigger>\n      </Accordion.Header>\n      <Accordion.Content className="logOpsAccordionContent">{children}</Accordion.Content>\n    </Accordion.Item>\n  </Accordion.Root>\n}\n`
tool = replaceOnce(tool, statBlock, inspectorBlock, 'InspectorSection helper')

tool = replaceOnce(
  tool,
  /function ServerDetails\(\{ rca, collection, selectedHost, onSelectHost \}\) \{[\s\S]*?\n\}\n\nfunction WorkloadDetail/,
  `function ServerDetails({ rca, collection, selectedHost, onSelectHost }) {\n  return <InspectorSection title="Server Details" className="logV2ServerDetails">\n    <div className="logV2ServerDetailsBody">\n      <SnapshotStrip collection={collection} />\n      <HostPeakSummary rca={rca} selectedHost={selectedHost} onSelectHost={onSelectHost} />\n    </div>\n  </InspectorSection>\n}\n\nfunction WorkloadDetail`,
  'ServerDetails Radix migration',
)

tool = replaceOnce(
  tool,
  `return <details className="logV2SourceAudit logV2ConsumerDetail">\n    <summary>Selected Consumer Details · {item.workload}</summary>\n    <div className="logV2ConsumerDetailBody"><section className="logV2Panel">`,
  `return <InspectorSection title={\`Selected Consumer Details · ${'${item.workload}'}\`} className="logV2ConsumerDetail">\n    <div className="logV2ConsumerDetailBody"><section className="logV2Panel">`,
  'WorkloadDetail opening',
)

tool = replaceOnce(
  tool,
  `</section></div>\n  </details>\n}\n\nfunction AnalyticsDiagnostics`,
  `</section></div>\n  </InspectorSection>\n}\n\nfunction AnalyticsDiagnostics`,
  'WorkloadDetail closing',
)

const diagnosticsReplacement = `function AnalyticsDiagnostics({ diagnostics, capabilities, mapping, verdict, rca, analysis }) {\n  const parity = diagnostics?.parity || {}\n  const attributionIssues = (rca?.hostPeaks || []).filter((item) => !hostPeakAttributionValid(item)).map((item) => item.host)\n  const source = analysis?.sourceHostProvenance || {}\n  const exact = mapping?.counts?.EXACT || 0\n  const nearest2m = mapping?.counts?.NEAREST_2M || 0\n  const nearest5m = mapping?.counts?.NEAREST_5M || 0\n  const unmapped = mapping?.counts?.UNMAPPED || 0\n  const mapped = exact + nearest2m + nearest5m\n  const processingModeRaw = diagnostics?.engineDiagnostics?.coreAggregator || diagnostics?.engineDiagnostics?.activeEngine || '—'\n  const processingMode = String(processingModeRaw).replace(/^JS\\b/i, 'JavaScript')\n  const duckDbStatus = String(diagnostics?.engineDiagnostics?.duckDbStatus || '')\n  const localAnalytics = /fail|timeout|unavailable/i.test(duckDbStatus) ? 'Fallback active' : (duckDbStatus || 'Available')\n  const sourceValidation = source.totalBlocks\n    ? \`${'${source.verifiedBlocks || 0}'}/${'${source.totalBlocks}'} verified${'${source.mismatchBlocks ? ` · ${source.mismatchBlocks} mismatch` : ""}'}\`\n    : 'Source headers unavailable'\n  const peakMapping = attributionIssues.length ? \`Review required · ${'${attributionIssues.join(", ")}'}\` : 'PASS'\n  const telemetry = capabilities?.mode === 'LEGACY'\n    ? 'Legacy mode · additional Linux telemetry unavailable'\n    : \`${'${capabilities?.mode || "Enhanced"}'} · ${'${capabilities?.coveragePct || 0}'}% coverage\`\n  const analysisResult = verdict?.status === 'SINGLE_CULPRIT_SUPPORTED'\n    ? \`Primary consumer identified${'${verdict?.topWorkload ? ` · ${verdict.topWorkload}` : ""}'}\`\n    : 'No single dominant root cause'\n  const sourceRaw = source.totalBlocks\n    ? \`${'${source.status || "WARN"}'} · verified ${'${source.verifiedBlocks || 0}'}/${'${source.totalBlocks}'} · unverified ${'${source.unverifiedBlocks || 0}'} · mismatch ${'${source.mismatchBlocks || 0}'} · dropped T/P ${'${source.droppedTelemetryRows || 0}'}/${'${source.droppedProcessRows || 0}'}\`\n    : 'WARN · raw source-host headers unavailable'\n\n  return <InspectorSection title="Diagnostics" className="logOpsDiagnostics">\n    <div className="logOpsDiagGrid">\n      <div><span>Analysis Engine</span><strong>{diagnostics?.engineDiagnostics?.rcaEngine || 'SPHERE v3.6.3'}</strong></div>\n      <div><span>Processing Mode</span><strong>{processingMode}</strong></div>\n      <div><span>Process Mapping</span><strong>{mapped.toLocaleString()} mapped · {unmapped} unmapped</strong></div>\n      <div><span>Source Validation</span><strong>{sourceValidation}</strong></div>\n      <div><span>Peak Host Mapping</span><strong>{peakMapping}</strong></div>\n      <div><span>Telemetry Coverage</span><strong>{telemetry}</strong></div>\n      <div className="logOpsDiagResult"><span>Analysis Result</span><strong>{analysisResult}</strong></div>\n    </div>\n    <InspectorSection title="Advanced Diagnostics" className="logOpsAdvancedDiagnostics">\n      <div className="logOpsDiagAdvanced"><table><tbody>\n        <tr><th>Local analytics engine</th><td>{localAnalytics}</td></tr>\n        <tr><th>DuckDB detail</th><td>{duckDbStatus || '—'} · {diagnostics?.engineReason || diagnostics?.engineDiagnostics?.reason || 'no error'}</td></tr>\n        <tr><th>Validation parity</th><td>{parity.status || 'NOT_RUN'} · compared {parity.compared || 0} · mismatches {parity.mismatchCount || 0}</td></tr>\n        <tr><th>Mapping detail</th><td>Exact {exact} · ≤2 min {nearest2m} · ≤5 min {nearest5m} · unmapped {unmapped}</td></tr>\n        <tr><th>Source validation detail</th><td>{sourceRaw}</td></tr>\n        <tr><th>Verdict rules</th><td>{verdict?.reasons?.join(' · ') || 'none'}</td></tr>\n      </tbody></table></div>\n    </InspectorSection>\n  </InspectorSection>\n}\n\nfunction SourceAudit`

tool = replaceOnce(
  tool,
  /function AnalyticsDiagnostics\(\{ diagnostics, capabilities, mapping, verdict, rca, analysis \}\) \{[\s\S]*?\n\}\n\nfunction SourceAudit/,
  diagnosticsReplacement,
  'Diagnostics friendly UX',
)

const sourceAuditReplacement = `function SourceAudit({ collections = [] }) {\n  const [viewAll, setViewAll] = React.useState(false)\n  const visibleCollections = viewAll ? collections : collections.slice(0, 12)\n  return <InspectorSection title={\`Source Audit · ${'${collections.length}'} collections\`} className="logOpsSourceAudit">\n    <div className="logOpsSourceToolbar">\n      <span>Verified input collections and source files.</span>\n      {collections.length > 12 ? <button type="button" onClick={() => setViewAll((value) => !value)}>{viewAll ? 'Show first 12' : \`View all ${'${collections.length}'}\`}</button> : null}\n    </div>\n    <div className="logOpsSourceTableWrap"><table className="logOpsSourceTable"><thead><tr><th>#</th><th>Collection</th><th>Host samples</th><th>Source file</th></tr></thead><tbody>{visibleCollections.map((item, index) => {\n      const hostSamples = item.rows.map((row) => \`${'${row.host}'}@${'${row.timeLabel || row.snapshot}'}${'${row.sourceHostStatus ? ` [${row.sourceHostStatus}]` : ""}'}\`).join(' · ')\n      return <tr key={item.key}><td>{index + 1}</td><td>{item.timeLabel}{item.endTime !== item.timeLabel ? \` → ${'${item.endTime}'}\` : ''}</td><td title={hostSamples}>{hostSamples}</td><td>{item.fileName}</td></tr>\n    })}</tbody></table></div>\n  </InspectorSection>\n}\n\nfunction topObservedConsumer`

tool = replaceOnce(
  tool,
  /function SourceAudit\(\{ collections = \[\] \}\) \{[\s\S]*?\n\}\n\nfunction topObservedConsumer/,
  sourceAuditReplacement,
  'Source Audit compact UX',
)

tool = tool.replaceAll('D-State WP', 'I/O Wait (D-State)')
write(toolPath, tool)

const tablePath = 'src/tools/components/VirtualResourceTableV14.jsx'
let table = read(tablePath)
table = replaceOnce(table, "if (dState > 0) return 'D-STATE'", "if (dState > 0) return 'I/O WAIT'", 'finding label')
table = replaceOnce(table, "['D_STATE', 'D-State']", "['D_STATE', 'I/O Wait']", 'quick filter label')
table = replaceOnce(table, "header: pointInTime ? 'D-State WP' : 'D-State Hits'", "header: pointInTime ? 'I/O Wait WP' : 'I/O Wait Hits'", 'table header label')
table = replaceOnce(table, "activeSortId === 'dState' ? (pointInTime ? 'D-State' : 'D-State hits')", "activeSortId === 'dState' ? (pointInTime ? 'I/O Wait' : 'I/O Wait hits')", 'sort label')
write(tablePath, table)

const versionPath = 'src/app/version.js'
let version = read(versionPath)
version = replaceOnce(version, "APP_VERSION = '1.16.1'", "APP_VERSION = '1.16.2'", 'version bump')
version = replaceOnce(version, "APP_PREVIOUS_VERSION = '1.16.0'", "APP_PREVIOUS_VERSION = '1.16.1'", 'previous version')
version = replaceOnce(version, "LOG_UI_REVISION = 'single-scroll-inspector-v1.16.1'", "LOG_UI_REVISION = 'operations-ux-v1.16.2'", 'UI revision')
write(versionPath, version)

const themePath = 'src/app/enterprise-theme.css'
let theme = read(themePath)
if (!theme.includes("@import './log-ops-v1162.css';")) theme += "@import './log-ops-v1162.css';\n"
write(themePath, theme)

const css = `/* SPHERE v1.16.2 - Operations UX */\n\n.logV2Inner { container-type: inline-size; }\n\n/* Compact context strip */\n.logV2StatsCompact {\n  display: grid !important;\n  grid-template-columns: repeat(12, minmax(0, 1fr)) !important;\n  min-height: 58px;\n  margin-bottom: 8px !important;\n  background: transparent !important;\n  border: 0 !important;\n  gap: 1px;\n}\n.logV2StatsCompact > :nth-child(1) { grid-column: span 3; }\n.logV2StatsCompact > :nth-child(2) { grid-column: span 6; }\n.logV2StatsCompact > :nth-child(3) { grid-column: span 3; }\n.logV2StatsCompact .logV2Stat {\n  background: var(--sphere-surface-1) !important;\n  padding: 10px 14px !important;\n  border: 0 !important;\n  border-right: 1px solid var(--sphere-border-subtle) !important;\n}\n.logV2StatsCompact .logV2Stat:first-child { border-radius: var(--sphere-radius) 0 0 var(--sphere-radius); }\n.logV2StatsCompact .logV2Stat:last-child { border-radius: 0 var(--sphere-radius) var(--sphere-radius) 0; border-right: 0 !important; }\n.logV2StatsCompact .logV2Stat strong { font-size: 15px !important; margin-top: 3px !important; }\n.logV2StatsCompact .logV2Stat small { margin-top: 2px !important; }\n\n/* Findings strip uses a 12-column grid and subgrid for stable alignment. */\n.logV2TrendSummary {\n  display: grid !important;\n  grid-template-columns: repeat(12, minmax(0, 1fr));\n  background: var(--sphere-surface-1) !important;\n  border: 0 !important;\n  border-left: 3px solid rgba(73, 200, 209, .48) !important;\n  margin-bottom: 22px !important;\n}\n.logV2TrendSummary .logV141SummaryGridTrend {\n  grid-column: 1 / -1;\n  display: grid !important;\n  grid-template-columns: subgrid !important;\n  border-top: 0 !important;\n}\n.logV2TrendSummary .logV141SummaryGridTrend > :nth-child(1) { grid-column: span 4; }\n.logV2TrendSummary .logV141SummaryGridTrend > :nth-child(2) { grid-column: span 3; }\n.logV2TrendSummary .logV141SummaryGridTrend > :nth-child(3) { grid-column: span 5; }\n.logV2TrendSummary .logV141SummaryGridTrend > div { padding: 10px 14px !important; }\n.logV2TrendSummary .logV141SummaryGridTrend strong { font-size: 14px !important; }\n.logV2TrendSummary .logV141SummaryGridTrend > div:first-child strong { color: #dcefe9 !important; }\n\n/* Radix accordion inspector */\n.logOpsAccordion { border-top: 1px solid var(--sphere-border-subtle); }\n.logOpsAccordion:last-child { border-bottom: 1px solid var(--sphere-border-subtle); }\n.logOpsAccordionItem { overflow: visible; }\n.logOpsAccordionHeader { margin: 0; }\n.logOpsAccordionTrigger {\n  width: 100%;\n  min-height: 38px;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  padding: 9px 4px;\n  border: 0;\n  background: transparent;\n  color: var(--sphere-text-secondary);\n  font: inherit;\n  font-size: 10px;\n  font-weight: 800;\n  text-align: left;\n  cursor: pointer;\n}\n.logOpsAccordionTrigger:hover { color: var(--sphere-text); }\n.logOpsAccordionTrigger:focus-visible {\n  outline: none;\n  color: var(--sphere-text);\n  box-shadow: inset 3px 0 0 rgba(73, 200, 209, .65);\n  padding-left: 10px;\n}\n.logOpsAccordionChevron { color: var(--sphere-text-muted); font-size: 14px; transition: transform 140ms ease; }\n.logOpsAccordionTrigger[data-state='open'] .logOpsAccordionChevron { transform: rotate(180deg); }\n.logOpsAccordionContent { overflow: hidden; }\n.logOpsAccordionContent[data-state='open'] { animation: logOpsReveal 140ms ease-out; }\n@keyframes logOpsReveal { from { opacity: .6; transform: translateY(-2px); } to { opacity: 1; transform: none; } }\n\n/* Friendly diagnostics */\n.logOpsDiagGrid {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 1px;\n  background: var(--sphere-border-subtle);\n  margin-bottom: 8px;\n}\n.logOpsDiagGrid > div { background: var(--sphere-surface-1); padding: 12px 14px; min-height: 58px; }\n.logOpsDiagGrid span { display: block; color: var(--sphere-text-muted); font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .055em; }\n.logOpsDiagGrid strong { display: block; margin-top: 5px; color: var(--sphere-text); font-size: 11px; line-height: 1.35; }\n.logOpsDiagResult { grid-column: 1 / -1; border-left: 3px solid rgba(73, 200, 209, .48); }\n.logOpsAdvancedDiagnostics { margin: 0 0 10px; border-top-color: rgba(148, 163, 184, .12); }\n.logOpsDiagAdvanced table { width: 100%; border-collapse: collapse; }\n.logOpsDiagAdvanced th, .logOpsDiagAdvanced td { padding: 8px 10px; border-bottom: 1px solid rgba(148, 163, 184, .09); text-align: left; font-size: 10px; }\n.logOpsDiagAdvanced th { width: 230px; color: var(--sphere-text-muted); font-weight: 700; }\n\n/* Source audit defaults to 12 rows; View all expands into the page instead of nested scrolling. */\n.logOpsSourceToolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 4px 10px; color: var(--sphere-text-muted); font-size: 10px; }\n.logOpsSourceToolbar button { border: 1px solid var(--sphere-border); background: var(--sphere-surface-2); color: var(--sphere-text-secondary); border-radius: 5px; padding: 5px 9px; font-size: 10px; cursor: pointer; }\n.logOpsSourceTableWrap { overflow-x: auto; overflow-y: visible; }\n.logOpsSourceTable { width: 100%; min-width: 1050px; border-collapse: collapse; table-layout: fixed; }\n.logOpsSourceTable thead { position: sticky; top: 0; z-index: 2; }\n.logOpsSourceTable th { background: var(--sphere-surface-2); color: var(--sphere-text-muted); font-size: 9px; text-transform: uppercase; letter-spacing: .05em; text-align: left; }\n.logOpsSourceTable th, .logOpsSourceTable td { padding: 8px 9px; border-bottom: 1px solid rgba(148, 163, 184, .08); font-size: 10px; }\n.logOpsSourceTable th:nth-child(1), .logOpsSourceTable td:nth-child(1) { width: 42px; }\n.logOpsSourceTable th:nth-child(2), .logOpsSourceTable td:nth-child(2) { width: 190px; }\n.logOpsSourceTable th:nth-child(4), .logOpsSourceTable td:nth-child(4) { width: 260px; }\n.logOpsSourceTable td:nth-child(3) { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--sphere-text-secondary); }\n\n/* More familiar Basis/Infra terminology in the table. */\n.logV2TableHeader button, .logV2VirtualRow > span { font-variant-numeric: tabular-nums; }\n\n@container (max-width: 980px) {\n  .logV2StatsCompact > :nth-child(1), .logV2StatsCompact > :nth-child(2), .logV2StatsCompact > :nth-child(3) { grid-column: span 12; border-radius: 0 !important; border-right: 0 !important; border-bottom: 1px solid var(--sphere-border-subtle) !important; }\n  .logV2StatsCompact > :first-child { border-radius: var(--sphere-radius) var(--sphere-radius) 0 0 !important; }\n  .logV2StatsCompact > :last-child { border-radius: 0 0 var(--sphere-radius) var(--sphere-radius) !important; border-bottom: 0 !important; }\n  .logV2TrendSummary .logV141SummaryGridTrend { grid-template-columns: 1fr !important; }\n  .logV2TrendSummary .logV141SummaryGridTrend > :nth-child(n) { grid-column: 1 !important; }\n  .logOpsDiagGrid { grid-template-columns: 1fr 1fr; }\n}\n\n@container (max-width: 680px) {\n  .logOpsDiagGrid { grid-template-columns: 1fr; }\n  .logOpsDiagResult { grid-column: 1; }\n}\n`
write('src/app/log-ops-v1162.css', css)

console.log('SPHERE v1.16.2 patch applied')
