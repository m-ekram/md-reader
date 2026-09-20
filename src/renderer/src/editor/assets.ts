/**
 * Resolving image paths for display.
 *
 * A markdown link is relative to the *document*. The renderer, though, is a page
 * loaded from the application bundle, so a relative `src` resolves against
 * `out/renderer/` and the image silently fails to load. The markdown must stay
 * relative — that is what makes a notes folder portable — so the resolution
 * happens at render time only.
 */

/** Left alone: already absolute, or not a filesystem path at all. */
const ABSOLUTE = /^(https?:|data:|blob:|file:|asset:|\/\/)/i

export function isAbsoluteSrc(src: string): boolean {
  return ABSOLUTE.test(src) || /^[a-zA-Z]:[\\/]/.test(src)
}

/** Turns a Windows or POSIX path into a file:// URL, encoding each segment. */
export function toFileUrl(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const withSlash = normalized.startsWith('/') ? normalized : `/${normalized}`
  const encoded = withSlash
    .split('/')
    .map((segment) => (/^[a-zA-Z]:$/.test(segment) ? segment : encodeURIComponent(segment)))
    .join('/')
  return `file://${encoded}`
}

/** Collapses `.` and `..` segments so a path above the base still resolves. */
function normalizeSegments(path: string): string {
  const out: string[] = []
  for (const segment of path.replace(/\\/g, '/').split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') out.pop()
    else out.push(segment)
  }
  return out.join('/')
}

/**
 * Resolves an image `src` for display against the document's directory.
 *
 * Returns the original string unchanged when it is already absolute or when
 * there is no document directory to resolve against — an unsaved buffer, for
 * instance — because a wrong absolute path is worse than a relative one.
 */
export function resolveAssetSrc(src: string, documentDir: string | null): string {
  if (!src) return src
  if (isAbsoluteSrc(src)) return src
  if (!documentDir) return src

  const decoded = src.replace(/^\.\//, '')
  const combined = `${documentDir.replace(/[\\/]+$/, '')}/${decoded}`
  return toFileUrl(normalizeSegments(combined))
}

/** The directory containing a document, or null for an unsaved buffer. */
export function directoryOf(documentPath: string | null): string | null {
  if (!documentPath) return null
  const idx = Math.max(documentPath.lastIndexOf('/'), documentPath.lastIndexOf('\\'))
  return idx > 0 ? documentPath.slice(0, idx) : null
}
