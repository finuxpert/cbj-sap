import { buildLogAnalysis, parseLogText } from '../logAnalysisV15.js'

self.onmessage = (event) => {
  try {
    const inputs = Array.isArray(event.data?.files) ? event.data.files : []
    const parsed = inputs.map((file) => parseLogText(file.text || '', file.name || 'log.txt'))
    const analysis = buildLogAnalysis(parsed)
    self.postMessage({ ok: true, analysis })
  } catch (error) {
    self.postMessage({ ok: false, error: error?.message || 'LOG v1.15 worker failed.' })
  }
}
