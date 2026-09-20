import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// The logger writes to the app data folder, which needs an Electron app object.
vi.mock('../log', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const { inlineImages, wrapDocument, buildHtml } = await import('./html')

let dir: string
let pngUrl: string

/** A one-pixel PNG: small, real, and a valid image to any reader. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'export-test-'))
  const png = join(dir, 'pic.png')
  await writeFile(png, Buffer.from(PNG_BASE64, 'base64'))
  pngUrl = pathToFileURL(png).href
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('inlineImages', () => {
  it('replaces a local image with a data URI', async () => {
    const out = await inlineImages(`<p><img src="${pngUrl}" alt="a"></p>`)
    expect(out).toContain('src="data:image/png;base64,')
    expect(out).not.toContain('file://')
    // The rest of the element is untouched.
    expect(out).toContain('alt="a"')
  })

  it('reads each distinct image once however often it appears', async () => {
    const html = `<img src="${pngUrl}"><img src="${pngUrl}">`
    const out = await inlineImages(html)
    expect(out.match(/data:image\/png;base64,/g)).toHaveLength(2)
  })

  it('leaves remote images alone', async () => {
    // Downloading them would make exporting a local file reach the network.
    const html = '<img src="https://example.com/remote.png">'
    expect(await inlineImages(html)).toBe(html)
  })

  it('keeps going when an image is missing', async () => {
    const missing = pathToFileURL(join(dir, 'gone.png')).href
    const html = `<img src="${missing}"><img src="${pngUrl}">`
    const out = await inlineImages(html)
    // One missing image must not cost the export the other nineteen.
    expect(out).toContain(missing)
    expect(out).toContain('data:image/png;base64,')
  })
})

describe('wrapDocument', () => {
  const payload = {
    title: 'My Notes',
    bodyHtml: '<p>hello</p>',
    css: '.x { color: red }',
    themeId: 'night',
    documentPath: null,
  }

  it('produces a complete document carrying the theme', () => {
    const html = wrapDocument(payload, payload.bodyHtml)
    expect(html.startsWith('<!doctype html>')).toBe(true)
    // The theme's own rules are keyed on this attribute, so an export without
    // it would be unstyled however much CSS it carried.
    expect(html).toContain('data-theme="night"')
    expect(html).toContain('<title>My Notes</title>')
    expect(html).toContain('.x { color: red }')
    expect(html).toContain('<p>hello</p>')
  })

  it('escapes the title rather than injecting it', () => {
    const html = wrapDocument({ ...payload, title: '</title><script>x()</script>' }, '')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;/title&gt;')
  })

  it('carries print rules, so printing does not split blocks across pages', () => {
    const html = wrapDocument(payload, '')
    expect(html).toContain('@media print')
    expect(html).toContain('break-inside: avoid')
  })
})

describe('buildHtml', () => {
  it('inlines and wraps in one step', async () => {
    const html = await buildHtml({
      title: 'Doc',
      bodyHtml: `<img src="${pngUrl}">`,
      css: '',
      themeId: 'github',
      documentPath: null,
    })
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('data:image/png;base64,')
  })
})
