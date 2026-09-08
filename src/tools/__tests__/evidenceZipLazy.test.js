import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

let zipModule
let zipImports

beforeAll(async () => { zipModule = await vi.importActual('jszip') })
beforeEach(() => {
  vi.resetModules()
  zipImports = 0
  vi.doMock('jszip', () => {
    zipImports += 1
    return zipModule
  })
})
afterEach(() => { vi.doUnmock('jszip') })

async function archive(name = 'evidence.ZIP') {
  const zip = new zipModule.default()
  zip.file('logs/app.log', 'log evidence')
  zip.file('note.TXT', 'text evidence')
  zip.file('table.csv', 'host,cpu\nAPP1,10')
  zip.file('image.svg', '<svg/>')
  zip.file('__MACOSX/ignored.log', 'ignored')
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  return Object.assign(bytes, { name, lastModified: 1234567890000 })
}

describe('ZIP-only lazy loading', () => {
  it('does not import JSZip for empty input or ordinary files, preserving identity and order', async () => {
    const { expandZipAwareFiles } = await import('../evidence-utils.js')
    expect(zipImports).toBe(0)
    expect(await expandZipAwareFiles(null)).toEqual([])
    const files = ['first.log', 'second.TXT', 'third.csv', 'skip.pdf'].map((name) => new File(['evidence'], name))
    const expanded = await expandZipAwareFiles(files, ['log', 'txt', 'csv'])
    expect(expanded).toEqual(files.slice(0, 3))
    expanded.forEach((file, index) => expect(file).toBe(files[index]))
    expect(zipImports).toBe(0)
  })

  it('loads JSZip on demand and preserves ZIP filtering, filenames, contents, and timestamps', async () => {
    const { expandZipAwareFiles } = await import('../evidence-utils.js')
    const input = await archive()
    expect(zipImports).toBe(0)
    const expanded = await expandZipAwareFiles([input], ['LOG', 'TXT', 'CSV'])
    expect(zipImports).toBe(1)
    expect(expanded.map((file) => file.name)).toEqual(['app.log', 'note.TXT', 'table.csv'])
    expect(await Promise.all(expanded.map((file) => file.text()))).toEqual(['log evidence', 'text evidence', 'host,cpu\nAPP1,10'])
    expect(expanded.every((file) => file instanceof File && file.lastModified === input.lastModified)).toBe(true)
  })

  it('reuses the module across ZIPs and preserves mixed-input ordering and unrestricted extraction', async () => {
    const { expandZipAwareFiles } = await import('../evidence-utils.js')
    const plain = new File(['plain'], 'first.log')
    const expanded = await expandZipAwareFiles([plain, await archive(), await archive('second.zip')])
    expect(expanded[0]).toBe(plain)
    expect(expanded.map((file) => file.name)).toEqual(['first.log', 'app.log', 'note.TXT', 'table.csv', 'image.svg', 'app.log', 'note.TXT', 'table.csv', 'image.svg'])
    expect(zipImports).toBe(1)
  })

  it('propagates corrupt ZIP errors to the existing upload error handler', async () => {
    const { expandZipAwareFiles } = await import('../evidence-utils.js')
    const broken = Object.assign(new Uint8Array([1, 2, 3]), { name: 'broken.zip' })
    await expect(expandZipAwareFiles([broken])).rejects.toThrow()
    expect(zipImports).toBe(1)
  })
})
