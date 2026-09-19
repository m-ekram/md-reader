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
 * Describes what is likely responsible, so the warning is actionable rather
 * than just "this file may change".
 */
function explain(original: string): string {
  const causes: string[] = []
  if (/^---\r?\n/.test(original)) causes.push('YAML front matter')
  if (/^!\[[^\]]*\]\([^)]*\)\s*$/m.test(original)) causes.push('image alt text')
  if (/^>\s*\[![A-Z]+\]/m.test(original)) causes.push('callouts')
  if (/^\[TOC\]\s*$/m.test(original)) causes.push('a table of contents marker')
  if (/^\[[^\]]+\]:\s*\S+/m.test(original)) causes.push('reference-style links')
  return causes.length > 0
    ? `Saving may alter ${causes.join(', ')} in this file.`
    : 'Saving will reformat parts of this file.'
}

export function checkRoundTrip(original: string, reserialized: string): LossReport {
  const a = normalize(original)
  const b = normalize(reserialized)
  if (a === b) return { lossy: false, note: '', firstDiffLine: null }
  return { lossy: true, note: explain(original), firstDiffLine: firstDifference(a, b) }
}
