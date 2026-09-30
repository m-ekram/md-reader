/**
 * Search and replace over plain text, shared by the folder search (in its
 * worker), replace across the folder (in main) and its preview (in the page),
 * so all three agree on what matches and what a replacement becomes.
 *
 * The find bar in the document uses its editors' own search, which takes the
 * same options.
 */

export interface SearchSpec {
  query: string
  /** The query is a regular expression; `^` and `$` then work a line at a time. */
  regexp?: boolean
  caseSensitive?: boolean
  /** Not inside a longer word; letters and digits in any script count. */
  wholeWord?: boolean
}

export type Compiled = { ok: true; re: RegExp } | { ok: false; error: string }

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function compileSearch(spec: SearchSpec): Compiled {
  if (!spec.query) return { ok: false, error: 'Nothing to search for.' }
  let source = spec.regexp ? spec.query : escape(spec.query)
  // Lookarounds on letters and digits in any script: \b knows only ASCII, so
  // "café" would count as ending at the é.
  if (spec.wholeWord) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`
  const flags = `gu${spec.caseSensitive ? '' : 'i'}${spec.regexp ? 'm' : ''}`
  try {
    return { ok: true, re: new RegExp(source, flags) }
  } catch (err) {
    const why = String((err as Error).message ?? err).replace(/^Invalid regular expression: /, '')
    return { ok: false, error: `Not a valid pattern: ${why}` }
  }
}

/**
 * Every match, in order. A match of nothing moves the search on by one
 * character, or it would be found again forever.
 */
export function findAll(
  text: string,
  re: RegExp,
  limit = Infinity
): Array<{ from: number; to: number; match: RegExpExecArray }> {
  const out: Array<{ from: number; to: number; match: RegExpExecArray }> = []
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)
  for (let m = r.exec(text); m && out.length < limit; m = r.exec(text)) {
    out.push({ from: m.index, to: m.index + m[0].length, match: m })
    if (m[0].length === 0) r.lastIndex = m.index + 1
  }
  return out
}

/**
 * What a match is replaced with. For a regular expression, `$1`, `$<name>`,
 * `$&` and `$$` mean what they do in JavaScript; for plain text the
 * replacement is taken as written.
 */
export function expandReplacement(
  replacement: string,
  match: RegExpExecArray,
  regexp: boolean
): string {
  if (!regexp) return replacement
  return replacement.replace(/\$(\$|&|<([^>]+)>|(\d{1,2}))/g, (_all, token, name, digits) => {
    if (token === '$') return '$'
    if (token === '&') return match[0]
    if (name !== undefined) return match.groups?.[name] ?? ''
    return match[Number(digits)] ?? ''
  })
}

export interface ReplaceSpec extends SearchSpec {
  replacement: string
}

/** A line with a match, as it is and as the replacement would make it. */
export interface ReplaceSample {
  line: number
  before: string
  after: string
}

/** A text's matches for a replace, with a few sample lines before and after. */
export function previewText(
  text: string,
  re: RegExp,
  spec: ReplaceSpec,
  maxSamples = 3
): { count: number; samples: ReplaceSample[] } {
  const found = findAll(text, re)
  const samples: ReplaceSample[] = []
  const seen = new Set<number>()
  for (const f of found) {
    if (samples.length >= maxSamples) break
    const start = text.lastIndexOf('\n', f.from - 1) + 1
    if (seen.has(start)) continue
    seen.add(start)
    const endAt = text.indexOf('\n', f.to)
    const before = text.slice(start, endAt < 0 ? text.length : endAt)
    samples.push({
      line: text.slice(0, start).split('\n').length,
      before,
      after: replaceAllIn(before, re, spec.replacement, spec.regexp === true).text,
    })
  }
  return { count: found.length, samples }
}

/** Replaces every match, and says how many there were. */
export function replaceAllIn(
  text: string,
  re: RegExp,
  replacement: string,
  regexp: boolean
): { text: string; count: number } {
  const found = findAll(text, re)
  if (found.length === 0) return { text, count: 0 }
  let out = ''
  let at = 0
  for (const f of found) {
    out += text.slice(at, f.from) + expandReplacement(replacement, f.match, regexp)
    at = f.to
  }
  return { text: out + text.slice(at), count: found.length }
}
