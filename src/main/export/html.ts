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
import { extname } from 'node:path'
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

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
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
      const path = fileURLToPath(url)
      const data = await readFile(path)
      if (data.byteLength > MAX_INLINE_BYTES) continue

      const mime = MIME_BY_EXT[extname(path).toLowerCase()] ?? 'application/octet-stream'
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
