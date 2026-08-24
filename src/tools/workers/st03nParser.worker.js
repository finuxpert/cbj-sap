import { analyzeSt03nFiles } from '../st03nAnalysis2026.js'

self.onmessage = async (event) => {
  try {
    const files = Array.isArray(event.data?.files) ? event.data.files : []
    const analysis = await analyzeSt03nFiles(files)
    self.postMessage({ ok: true, analysis })
  } catch (error) {
    self.postMessage({ ok: false, error: error?.message || 'ST03N worker failed.' })
  }
}
