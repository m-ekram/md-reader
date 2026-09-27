/**
 * Self-contained HTML export.
 *
 * "Self-contained" is the whole point: the exported file is something you send
 * to someone, so it has to survive leaving this machine. Stylesheets are
 * inlined and local images are embedded as data URIs, because a relative link
 * to `assets/diagram.png` is a broken image the moment the file is attached to
 * an email.
 *
 * Remote images are left as URLs. Downloading them would mean this export
 * silently makes network requests, which an export of a local document has no
 * business doing.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { log } from '../log'

export interface ExportPayload {
  title: string
  /** Already cleaned and sanitized by the renderer. */
  bodyHtml: string
  css: string
  themeId: string
  documentPath: string | null
}

/** Images above this are left as links: a data URI of one is unusable anyway. */
const MAX_INLINE_BYTES = 10 * 1024 * 1024

/**
 * The image type a file's own first bytes declare, or null for anything else.
 *
 * Decided by content, never by the link's extension: a received document can
 * point an "image" at any file, and whatever is embedded travels inside an
 * export the user then shares. Anything that is not recognisably an image —
 * a key, a password file, a text file named .png — is not embedded.
 */
export function imageType(data: Buffer): string | null {
  const head = data.subarray(0, 16)
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png'
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg'
  const ascii = head.toString('latin1')
  if (ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a')) return 'image/gif'
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return 'image/webp'
  if (ascii.startsWith('BM')) return 'image/bmp'
  if (ascii.slice(4, 12) === 'ftypavif' || ascii.slice(4, 12) === 'ftypavis') return 'image/avif'
  // SVG is text: its root element, after an optional XML declaration.
  const text = data.subarray(0, 1024).toString('utf8').replace(/^﻿/, '').trimStart()
  if (/^(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(text)) return 'image/svg+xml'
  return null
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Replaces every `file://` image source with a data URI.
 *
 * The renderer has already resolved relative links to absolute `file://` URLs
 * for display, so those are what appear here. Anything unreadable keeps its
 * original source rather than failing the export: a missing image is a worse
 * outcome when it takes the other twenty with it.
 */
export async function inlineImages(html: string): Promise<string> {
  const sources = new Map<string, string>()

  for (const match of html.matchAll(/src="(file:\/\/[^"]+)"/g)) {
    const url = match[1]
    if (sources.has(url)) continue

    try {
      // A file URL with a host is a network share: on Windows, reading it
      // sends the user's credentials to whoever named the host. Refused before
      // any read.
      const host = new URL(url).hostname
      if (host !== '' && host !== 'localhost') {
        log.warn('refused a network image path', { url })
        continue
      }
      const path = fileURLToPath(url)
      const data = await readFile(path)
      if (data.byteLength > MAX_INLINE_BYTES) continue

      const mime = imageType(data)
      if (!mime) {
        log.warn('not an image; left out of the export', { url })
        continue
      }
      sources.set(url, `data:${mime};base64,${data.toString('base64')}`)
    } catch (err) {
      log.warn('could not inline image', { url, err: String(err) })
    }
  }

  let out = html
  for (const [url, dataUri] of sources) {
    out = out.split(`src="${url}"`).join(`src="${dataUri}"`)
  }
  return out
}

/**
 * Wraps the body in a complete document.
 *
 * `data-theme` on the root is what the theme's own rules key off, so the
 * export is styled by exactly the file the application loads rather than by a
 * second copy that could drift.
 */
export function wrapDocument(payload: ExportPayload, body: string): string {
  return `<!doctype html>
<html lang="en" data-theme="${escapeHtml(payload.themeId)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(payload.title)}</title>
<style>
${payload.css}

/* Export-only: the application supplies this framing through its own chrome. */
body {
  margin: 0;
  background: var(--doc-bg);
  color: var(--doc-fg);
  font-family: var(--doc-font);
  font-size: var(--doc-font-size);
  line-height: var(--doc-line-height);
}
.export-document {
  max-width: var(--doc-measure);
  margin: 0 auto;
  padding: 48px 32px;
}
/* Printing: backgrounds are kept, and blocks are not split across pages. */
@media print {
  body { background: #fff; }
  .export-document { max-width: none; padding: 0; }
  pre, blockquote, table, figure { break-inside: avoid; }
  h1, h2, h3, h4, h5, h6 { break-after: avoid; }
}
</style>
</head>
<body>
<article class="export-document milkdown">
${body}
</article>
</body>
</html>
`
}

/**
 * Removes the local paths inlining could not replace.
 *
 * An image that could not be read keeps its `file:///C:/Users/<name>/…`
 * source, and a link to a local file keeps its href — each one a path into the
 * author's machine, inside a file whose purpose is to be sent to someone else.
 * Neither would work for the recipient anyway. The image keeps its element and
 * alt text; the link keeps its words.
 *
 * Runs on sanitized output, whose attributes are always double-quoted.
 */
export function stripLocalPaths(html: string): string {
  return html
    .replace(/\ssrc="file:[^"]*"/gi, '')
    .replace(/<a\b[^>]*\shref="file:[^"]*"[^>]*>([\s\S]*?)<\/a>/gi, '$1')
}

/** The complete, self-contained document. */
export async function buildHtml(payload: ExportPayload): Promise<string> {
  return wrapDocument(payload, stripLocalPaths(await inlineImages(payload.bodyHtml)))
}
