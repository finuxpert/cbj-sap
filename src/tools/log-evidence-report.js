export function buildLogEvidenceReportText(analysis) {
  if (!analysis) return ''
  const primary = analysis.primary
  return [
    'SAP Log Evidence RCA Summary',
    `Verdict: ${analysis.verdict}`,
    `Confidence: ${analysis.confidence}% - ${analysis.confidenceText}`,
    primary ? `Primary Error: ${primary.name}` : 'Primary Error: -',
    primary ? `Error Family: ${primary.family}` : 'Error Family: -',
    primary ? `Owner Direction: ${primary.owner}` : 'Owner Direction: -',
    `Next Action: ${analysis.nextAction}`,
    `Parsed Rows: ${analysis.rows?.length || 0}`,
  ].join('\n')
}
