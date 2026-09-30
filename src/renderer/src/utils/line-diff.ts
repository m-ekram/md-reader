/**
 * What changed between two texts, line by line, for the version history.
 *
 * The longest run of lines the two share, found by the usual table; lines
 * outside it were taken out of the first or put into the second. The table
 * grows with the product of the two lengths, so past `limit` cells the answer
 * is null and the caller shows the text as it is. The common start and end are
 * trimmed first, which is most of a document between two saves.
 */
export interface DiffLine {
  kind: 'same' | 'add' | 'del'
  text: string
}

export function diffLines(before: string, after: string, limit = 4_000_000): DiffLine[] | null {
  const a = before.split('\n')
  const b = after.split('\n')
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)
  if ((midA.length + 1) * (midB.length + 1) > limit) return null

  // lcs[i][j]: the longest shared run of midA from i and midB from j.
  const width = midB.length + 1
  const lcs = new Uint32Array((midA.length + 1) * width)
  for (let i = midA.length - 1; i >= 0; i--) {
    for (let j = midB.length - 1; j >= 0; j--) {
      lcs[i * width + j] =
        midA[i] === midB[j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1])
    }
  }

  const out: DiffLine[] = a.slice(0, start).map((text) => ({ kind: 'same' as const, text }))
  let i = 0
  let j = 0
  while (i < midA.length || j < midB.length) {
    if (i < midA.length && j < midB.length && midA[i] === midB[j]) {
      out.push({ kind: 'same', text: midA[i] })
      i++
      j++
    } else if (
      j < midB.length &&
      (i >= midA.length || lcs[i * width + j + 1] >= lcs[(i + 1) * width + j])
    ) {
      // Taken out before put in, as a reader expects.
      if (i < midA.length && lcs[(i + 1) * width + j] === lcs[i * width + j + 1]) {
        out.push({ kind: 'del', text: midA[i] })
        i++
      } else {
        out.push({ kind: 'add', text: midB[j] })
        j++
      }
    } else {
      out.push({ kind: 'del', text: midA[i] })
      i++
    }
  }
  for (const text of a.slice(endA)) out.push({ kind: 'same', text })
  return out
}
