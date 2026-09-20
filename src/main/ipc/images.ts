/**
 * Pasted and dropped images.
 *
 * An image on the clipboard has no file behind it, so it has to be written
 * somewhere before the document can reference it. Writing it next to the
 * document and linking relatively keeps the note self-contained and portable —
 * an absolute path or a base64 blob would not survive the folder being moved
 * or synced to another machine.
 */
import { ipcMain } from 'electron'
import { mkdir, writeFile, access } from 'node:fs/promises'
import { dirname, extname, join, relative, sep } from 'node:path'
import { log } from '../log'

export interface SaveImageRequest {
  /** The document the image belongs to; null for an unsaved buffer. */
  documentPath: string | null
  /** Folder name, relative to the document. */
  assetsFolder: string
  /** Original filename when dropped; used to keep a meaningful name. */
  suggestedName?: string
  data: Uint8Array
  mimeType: string
}

export interface SaveImageResult {
  ok: boolean
  /** Relative path to put in the markdown, using forward slashes. */
  relativePath?: string
  absolutePath?: string
  error?: string
}

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
  'image/avif': '.avif',
}

/** Strips anything that would be awkward in a filename or a markdown link. */
function sanitize(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w\-. ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
}

function timestamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** Never overwrites: an existing name gets a numeric suffix. */
async function uniquePath(dir: string, base: string, ext: string): Promise<string> {
  let candidate = join(dir, `${base}${ext}`)
  let n = 1
  while (await exists(candidate)) {
    candidate = join(dir, `${base}-${n}${ext}`)
    n++
  }
  return candidate
}

export function registerImageIpc(): void {
  ipcMain.handle('images:save', async (_e, req: SaveImageRequest): Promise<SaveImageResult> => {
    try {
      if (!req.documentPath) {
        // Without a document there is no folder to be relative to, and writing
        // to a temporary location would break the moment the note was saved.
        return { ok: false, error: 'Save the document before adding images to it.' }
      }

      const ext =
        MIME_EXTENSIONS[req.mimeType] ??
        (req.suggestedName ? extname(req.suggestedName).toLowerCase() : '') ??
        '.png'

      const base = req.suggestedName ? sanitize(req.suggestedName) : ''
      const name = base.length > 0 ? base : `image-${timestamp()}`

      const docDir = dirname(req.documentPath)
      const assetsDir = join(docDir, req.assetsFolder)
      await mkdir(assetsDir, { recursive: true })

      const absolutePath = await uniquePath(assetsDir, name, ext || '.png')
      await writeFile(absolutePath, Buffer.from(req.data))

      // Forward slashes: markdown links use them on every platform, and a
      // backslash would be read as an escape by other renderers.
      const relativePath = relative(docDir, absolutePath).split(sep).join('/')

      log.info('saved pasted image', { absolutePath })
      return { ok: true, relativePath, absolutePath }
    } catch (err) {
      log.error('image save failed', { err: String(err) })
      return { ok: false, error: String(err) }
    }
  })
}
