/**
 * Following a `[[wiki link]]`, from a Ctrl+click in the editor.
 *
 * The note is looked for among the open folder's files (utils/wiki-resolve),
 * opened, and shown at the heading after `#`, if the link names one. A link
 * to a note that is not there offers to make it, beside the note the link is
 * in. Without an open folder there is nowhere to look, and it says so.
 */
import { activeDoc, openPath, useDocuments } from './documents'
import { folderOf, refreshArticles, refreshTree, useWorkspace } from './workspace'
import { notify } from './notifications'
import { parseWikiTarget } from '../editor/wiki-decorations'
import { resolveWikiTarget } from '../utils/wiki-resolve'
import { shownSourceFor } from '../editor/source-registry'
import { extractHeadings, plainHeadingText } from '../editor/outline'
import { describeError } from '../utils/report'

/** Shows `heading` in the document `docId`, once it is on screen. */
async function revealHeading(docId: string, heading: string): Promise<void> {
  const wanted = heading.toLowerCase()
  const deadline = performance.now() + 10_000
  while (performance.now() < deadline) {
    const doc = activeDoc.value
    if (!doc || doc.id !== docId) return
    if (doc.sourceMode) {
      const source = shownSourceFor(doc.id)
      const h = extractHeadings(doc.content).find(
        (x) => plainHeadingText(x.text).toLowerCase() === wanted
      )
      if (source && h) {
        source.revealLine(h.line)
        return
      }
    } else {
      const el = [
        ...document.querySelectorAll<HTMLElement>(
          '.ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6'
        ),
      ].find((e) => (e.textContent ?? '').trim().toLowerCase() === wanted)
      if (el) {
        el.scrollIntoView({ block: 'start' })
        return
      }
    }
    await new Promise((r) => requestAnimationFrame(r))
  }
}

/** Makes the note a link names, and opens it. */
async function createNote(name: string, besideDocPath: string | null): Promise<void> {
  const root = useWorkspace().root
  if (!root) return
  const parts = name.split('/').filter(Boolean)
  const fileName = parts.pop() ?? name
  // A path in the link is taken from the open folder; a bare name goes beside
  // the note the link is in.
  const inFolder =
    besideDocPath && besideDocPath.toLowerCase().startsWith(root.toLowerCase())
      ? folderOf(besideDocPath)
      : root
  // Main joins with node's path.join, which takes '/' on either platform.
  const dir = parts.length ? [root, ...parts].join('/') : inFolder
  try {
    const path = await window.api.fileops.createFile(dir, fileName)
    await refreshTree()
    void refreshArticles()
    await openPath(path)
  } catch (err) {
    notify(describeError(err), { kind: 'error' })
  }
}

export async function followWikiLink(link: string, fromDocId: string): Promise<void> {
  const ws = useWorkspace()
  const { name, heading } = parseWikiTarget(link)
  if (!ws.root) {
    notify(`Open the folder your notes are in to follow [[${name}]].`)
    return
  }
  const from = useDocuments().docs.find((d) => d.id === fromDocId)?.path ?? null
  let target = resolveWikiTarget(name, from, ws.articles)
  // The list is read when the folder opens; a note made since is found on a
  // second look.
  if (!target) {
    await refreshArticles()
    target = resolveWikiTarget(name, from, ws.articles)
  }
  if (!target) {
    notify(`No note is named “${name}”.`, {
      actions: [{ label: `Create ${name.split('/').pop()}.md`, run: () => createNote(name, from) }],
    })
    return
  }
  const doc = await openPath(target)
  if (doc && heading) await revealHeading(doc.id, heading)
}
