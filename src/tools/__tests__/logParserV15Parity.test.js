import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const toolUrl = new URL('../ToolLogAutoRcaV5.jsx', import.meta.url)
const workerV15Url = new URL('../workers/logParserV15.worker.js', import.meta.url)
const workerV14Url = new URL('../workers/logParserV14.worker.js', import.meta.url)

describe('LOG parser V15 execution-path parity', () => {
  it('keeps the UI fallback and Web Worker on the same V15 parser', () => {
    const toolSource = readFileSync(toolUrl, 'utf8')
    const workerSource = readFileSync(workerV15Url, 'utf8')

    expect(toolSource).toContain("from './logAnalysisV15.js'")
    expect(toolSource).toContain("new URL('./workers/logParserV15.worker.js', import.meta.url)")
    expect(toolSource).toContain('telemetryCapabilitiesV15(nextAnalysis)')
    expect(toolSource).not.toContain("from './logAnalysisV14.js'")

    expect(workerSource).toContain("from '../logAnalysisV15.js'")
    expect(workerSource).toContain('buildLogAnalysis(parsed)')
    expect(existsSync(workerV14Url)).toBe(false)
  })
})
