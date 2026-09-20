/**
 * Subsequence matching with a score, so "frnt" finds "frontmatter.md".
 *
 * Shared by Open Quickly and the command palette rather than written twice:
 * two implementations would drift, and the ranking is the part users notice.
 */

/**
 * Scores `pattern` against `text`, or returns null when the pattern does not
 * fit at all — letting the caller drop the candidate rather than rank it last.
 */
export function fuzzyScore(text: string, pattern: string): number | null {
  if (pattern.length === 0) return 0
  const lower = text.toLowerCase()
  let ti = 0
  let total = 0
  let streak = 0

  for (const ch of pattern) {
    const found = lower.indexOf(ch, ti)
    if (found < 0) return null

    // Consecutive characters and matches after a separator read as a better
    // match than characters scattered through the name.
    if (found === ti && ti > 0) streak++
    else streak = 0
    total += 10 + streak * 5
    if (found === 0 || /[\s\-_./\\>]/.test(lower[found - 1] ?? '')) total += 8
    total -= Math.min(found - ti, 10)

    ti = found + 1
  }
  // Shorter names matching the same pattern are usually what was meant.
  return total - Math.min(text.length / 4, 15)
}
