import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// The logger writes to the app data folder, which needs an Electron app object.
vi.mock('../log', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const { inlineImages, wrapDocument, buildHtml, stripLocalPaths } = await import('./html')

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

  it('embeds nothing that is not an image, whatever the link calls it', async () => {
    // A received document can point an image at any file. Embedded, it would
    // travel inside an export the user then shares: a key, a password file.
    const secret = 'PRIVATE KEY — must never leave this machine'
    const urls: string[] = []
    for (const name of ['notes.txt', 'id_rsa', 'disguised.png']) {
      const p = join(dir, name)
      await writeFile(p, secret, 'utf8')
      urls.push(pathToFileURL(p).href)
    }
    const out = await inlineImages(urls.map((u) => `<img src="${u}">`).join(''))
    expect(out).not.toContain('data:')
    expect(out).not.toContain(Buffer.from(secret).toString('base64'))
  })

  it('still recognises every image type an export can carry', async () => {
    const { imageType } = await import('./html')
    const bytes = (...b: number[]) => Buffer.from(b)
    const text = (s: string) => Buffer.from(s, 'latin1')
    expect(imageType(Buffer.from(PNG_BASE64, 'base64'))).toBe('image/png')
    expect(imageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))).toBe('image/jpeg')
    expect(imageType(text('GIF89a\x01\x00'))).toBe('image/gif')
    expect(imageType(text('RIFF\x24\x00\x00\x00WEBPVP8 '))).toBe('image/webp')
    expect(imageType(text('BM\x36\x00\x00\x00'))).toBe('image/bmp')
    expect(imageType(text('\x00\x00\x00\x1cftypavif'))).toBe('image/avif')
    expect(
      imageType(text('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>'))
    ).toBe('image/svg+xml')
    expect(imageType(text('<!-- drawn by hand -->\n<svg width="1"></svg>'))).toBe('image/svg+xml')
    expect(imageType(text('-----BEGIN OPENSSH PRIVATE KEY-----'))).toBeNull()
    expect(imageType(text('<html><svg></svg></html>'))).toBeNull()
  })

  it('refuses a network path rather than reading it', async () => {
    // On Windows a file URL with a host is an SMB share: reading it sends the
    // user's credentials to whoever named the host.
    const { log } = await import('../log')
    vi.mocked(log.warn).mockClear()
    const html = '<img src="file://attacker.example/share/pic.png">'
    expect(await inlineImages(html)).toBe(html)
    expect(log.warn).toHaveBeenCalledWith('refused a network image path', expect.anything())
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

describe('stripLocalPaths', () => {
  const localImg = '<img src="file:///C:/Users/someone/notes/missing.png" alt="a chart">'

  it('drops the path from an image it could not embed, keeping the alt text', () => {
    const out = stripLocalPaths(`<p>${localImg}</p>`)
    expect(out).not.toContain('file:')
    expect(out).not.toContain('Users/someone')
    expect(out).toContain('alt="a chart"')
  })

  it('unwraps a link to a local file, keeping its words', () => {
    const out = stripLocalPaths(
      '<p>See <a href="file:///C:/Users/someone/plan.md">the plan</a>.</p>'
    )
    expect(out).toBe('<p>See the plan.</p>')
  })

  it('leaves web links and embedded images alone', () => {
    const html =
      '<a href="https://example.com">site</a><img src="data:image/png;base64,AAAA" alt="x">'
    expect(stripLocalPaths(html)).toBe(html)
  })
})

describe('an exported document', () => {
  it('contains no local path once built, even for an image that could not be read', async () => {
    const html = await buildHtml({
      title: 'Doc',
      bodyHtml: `<img src="${pathToFileURL(join(dir, 'gone.png')).href}" alt="gone"><img src="${pngUrl}">`,
      css: '',
      themeId: 'github',
      documentPath: null,
    })
    expect(html).not.toMatch(/file:/)
    expect(html).toContain('data:image/png;base64,')
  })
})
