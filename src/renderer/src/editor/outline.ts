/**
 * Heading extraction for the Outline panel.
 *
 * Parses the markdown text rather than the ProseMirror document, for two
 * reasons: it keeps working unchanged when source mode arrives, and it stays
 * correct for constructs the editor schema does not model.
 *
 * The subtlety is that `#` inside a fenced code block is not a heading, and a
 * naive line scan gets that wrong on every file containing a shell script.
 */

export interface Heading {
  level: number
  text: string
  /** 1-indexed line in the source, for scroll-to. */
  line: number
}

const ATX = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/
const FENCE = /^(\s*)(`{3,}|~{3,})/

export function extractHeadings(markdown: string): Heading[] {
  const lines = markdown.split(/\r?\n/)
  const out: Heading[] = []

  let fence: string | null = null
  let inFrontMatter = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // YAML front matter opens on the very first line and its --- delimiters
    // must not be mistaken for a setext underline or a thematic break.
    if (i === 0 && /^---\s*$/.test(line)) {
      inFrontMatter = true
      continue
    }
    if (inFrontMatter) {
      if (/^(---|\.\.\.)\s*$/.test(line)) inFrontMatter = false
      continue
    }

    const fenceMatch = FENCE.exec(line)
    if (fenceMatch) {
      const marker = fenceMatch[2]
      if (fence === null) fence = marker[0]
      // A closing fence must use the same character and be at least as long.
      else if (marker[0] === fence) fence = null
      continue
    }
    if (fence !== null) continue

    const atx = ATX.exec(line)
    if (atx) {
      const text = atx[2].trim()
      if (text.length > 0) out.push({ level: atx[1].length, text, line: i + 1 })
      continue
    }

    // Setext: a heading is the line *above* the underline.
    const setext = /^(=+|-{2,})\s*$/.exec(line)
    if (setext && i > 0) {
      const prev = lines[i - 1].trim()
      if (prev.length > 0 && !/^[-*+]\s/.test(prev) && !ATX.test(prev)) {
        out.push({ level: setext[1][0] === '=' ? 1 : 2, text: prev, line: i })
      }
    }
  }

  return out
}

/** Strips inline markup so the outline reads as text, not source. */
export function plainHeadingText(text: string): string {
  return text
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/__([^_]*)__/g, '$1')
    .replace(/_([^_]*)_/g, '$1')
    .replace(/~~([^~]*)~~/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim()
}
