/**
 * The round-trip guard.
 *
 * Phase 0 measured that 31 of 43 markdown constructs survive a parse/serialize
 * cycle intact. The rest change, and a few (YAML front matter, block image alt
 * text) are destroyed outright. This runs on every file open so the user is
 * warned *before* they edit something we cannot write back faithfully, rather
 * than discovering it after the save.
 */

export interface LossReport {
  lossy: boolean
  note: string
  /** 1-indexed line of the first difference, when there is one. */
  firstDiffLine: number | null
}

function normalize(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\n+$/, '')
}

function firstDifference(a: string, b: string): number | null {
  const al = a.split('\n')
  const bl = b.split('\n')
  for (let i = 0; i < Math.max(al.length, bl.length); i++) {
    if (al[i] !== bl[i]) return i + 1
  }
  return null
}

/**
 * What a line of the original is, among the constructs a save rewrites.
 *
 * Measured against the editor's real output (see roundtrip.test.ts): tables
 * lose their delimiter-row and cell padding, reference links become inline,
 * two-space breaks become backslashes, entities are decoded, underlined
 * headings become # headings, indented code becomes fenced, and a bare * or _
 * is escaped. Front matter, callouts and [TOC] all survive, and are never
 * named. `next` is the line after, which marks an underlined heading's title.
 */
function constructOf(
  line: string,
  next: string | undefined,
  inFrontMatter: boolean
): string | null {
  // These two are kept intact by the editor's own plugins (frontmatter.ts,
  // image.ts); they are named only if that protection ever fails.
  if (inFrontMatter) return 'YAML front matter'
  if (/^!\[[^\]]*\]\([^)]*\)\s*$/.test(line)) return 'image alt text'
  if (/^\s*\|/.test(line)) return 'tables'
  if (/^\s*\[[^\]]+\]:\s*\S/.test(line) || /\]\[[^\]]*\]/.test(line)) return 'reference-style links'
  if (/^\s*(=+|-{2,})\s*$/.test(line) || (next !== undefined && /^\s*(=+|-{2,})\s*$/.test(next)))
    return 'underlined headings'
  if (/^( {4}|\t)/.test(line)) return 'indented code'
  if (/ {2,}$/.test(line)) return 'line breaks'
  if (/&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i.test(line)) return 'HTML entities'
  if (/(^|\s)[*_](\s|$)/.test(line)) return 'literal * and _'
  return null
}

/**
 * Names what a save would actually change, and where.
 *
 * Built from the lines that differ, not from what the file contains: the
 * earlier version named anything present, so a file with a table and a
 * callout was warned about the callout, which survives, and not the table,
 * which does not.
 */
function explain(original: string, reserialized: string, firstLine: number | null): string {
  const kept = new Set(reserialized.split('\n'))
  const lines = original.split('\n')
  // Front matter: a --- fence on the first line, up to the next one.
  const frontMatterEnd = lines[0] === '---' ? lines.indexOf('---', 1) : -1
  const names: string[] = []
  lines.forEach((line, i) => {
    if (line.trim() === '' || kept.has(line)) return
    const name = constructOf(line, lines[i + 1], i <= frontMatterEnd)
    if (name && !names.includes(name)) names.push(name)
  })
  const where = firstLine ? `, from line ${firstLine}` : ''
  if (names.length === 0) return `Saving will reformat parts of this file${where}.`
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).slice(0, 3).join(', ')} and ${names[names.length - 1]}`
  return `Saving will reformat ${list} in this file${where}.`
}

export function checkRoundTrip(original: string, reserialized: string): LossReport {
  const a = normalize(original)
  const b = normalize(reserialized)
  if (a === b) return { lossy: false, note: '', firstDiffLine: null }
  const firstDiffLine = firstDifference(a, b)
  return { lossy: true, note: explain(a, b, firstDiffLine), firstDiffLine }
}
