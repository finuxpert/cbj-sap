import { rankResourceConsumersV4 } from './workloadAnalyticsV4.js'
import { telemetryCapabilitiesV15 } from './logAnalysisV15.js'
import { enrichRankedRowsV15 } from './telemetryEnrichmentV15.js'
import { refineWorkloadV14, verdictV14 } from './incidentTaxonomyV14.js'

export async function rankResourceConsumersV5(processes = [], rca = {}, analysis = {}) {
  const base = await rankResourceConsumersV4(processes, rca)
  const capabilities = telemetryCapabilitiesV15(analysis?.telemetry ? analysis : (rca.validatedAnalysis || analysis || {}))
  const anchor = base.incidentAnchor || rca.resourceIncidentAnchor || {}
  const enriched = enrichRankedRowsV15(base.rows || [], rca)
  const rows = enriched
    .map((row) => refineWorkloadV14(row, anchor, capabilities))
    .sort((a, b) => (
      b.causalScore - a.causalScore
      || b.incidentScore - a.incidentScore
      || (b.localConfidence?.score || 0) - (a.localConfidence?.score || 0)
      || b.footprintScore - a.footprintScore
    ))
  const verdict = verdictV14(rows, base.verdict || {}, anchor, capabilities)
  const engineDiagnostics = {
    ...(base.engineDiagnostics || {}),
    rcaEngine: 'RCA v3.6.1',
    coreAggregator: base.engineDiagnostics?.activeEngine || base.engine || 'JS core',
    telemetryMode: capabilities.mode,
    telemetryCapabilities: capabilities,
    collectorV22: capabilities.collectorV22 || false,
    collectorSchemas: capabilities.collectorSchemas || [],
    patternVersion: 'v2.1',
  }
  const collector = capabilities.collectorV22 ? ' · collector v2.2' : ''
  const engine = `RCA v3.6.1 · core ${base.engine || 'JS analytics'} · telemetry ${capabilities.mode.toLowerCase()}${collector} · pattern v2.1`

  rows.verdict = verdict
  rows.incidentAnchor = anchor
  rows.landscapeConfidence = base.landscapeConfidence
  rows.engineDiagnostics = engineDiagnostics
  rows.telemetryCapabilities = capabilities

  return {
    ...base,
    rows,
    verdict,
    engine,
    engineDiagnostics,
    telemetryCapabilities: capabilities,
    telemetryMode: capabilities.mode,
  }
}
