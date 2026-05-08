import { buildAnalysis } from './log-evidence-analysis.js'
import { parseGenericErrors } from './log-evidence-parser.js'

export async function runEvidenceAnalysis({ files, parseWpRows, serverInfo }) {
  const rows = []

  for (const file of files) {
    const text = await file.text()
    const wpRows = parseWpRows(text, file.name)
    rows.push(...(wpRows.length ? wpRows : parseGenericErrors(text, file.name)))
  }

  return buildAnalysis(
    files.map((file) => ({ name: file.name, size: file.size })),
    rows,
    serverInfo,
  )
}
