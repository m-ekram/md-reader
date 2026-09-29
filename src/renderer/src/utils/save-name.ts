/**
 * Where Save As suggests saving a document.
 *
 * It suggested "Untitled.md" in whatever folder the dialog last showed, so
 * every new note began as a rename. A document never saved is now named after
 * its first heading and put in the open folder, if there is one.
 */

/** The names Windows keeps for devices, with or without an extension. */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const MAX_LENGTH = 80

/** A heading made into a name Windows accepts; '' when nothing usable is left. */
export function safeFileName(title: string): string {
  let name = title
    // A link or image becomes its text.
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Emphasis, code and strike markers.
    .replace(/[*_`~]/g, '')
    // Characters Windows refuses in a name, and control characters.
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (name.length > MAX_LENGTH) name = name.slice(0, MAX_LENGTH)
  // Windows drops trailing dots and spaces, so the file would not be the name shown.
  name = name.replace(/[. ]+$/, '')
  if (RESERVED.test(name)) name += '_'
  return name
}

/** The first ATX heading's text, outside code blocks. */
function firstHeading(markdown: string): string | null {
  let fence: string | null = null
  for (const line of markdown.split('\n')) {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/)?.[1]
    if (marker) {
      if (fence === null) fence = marker[0]
      else if (marker[0] === fence) fence = null
      continue
    }
    if (fence !== null) continue
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.*?)(\s+#+)?\s*$/)
    if (heading?.[1]) return heading[1]
  }
  return null
}

export function suggestSavePath(
  doc: { path: string | null; name: string; content: string },
  folder: string | null
): string {
  if (doc.path) return doc.path
  const heading = firstHeading(doc.content)
  const name = (heading && safeFileName(heading)) || doc.name
  if (!folder) return `${name}.md`
  const sep = folder.includes('\\') ? '\\' : '/'
  return `${folder.replace(/[\\/]+$/, '')}${sep}${name}.md`
}
