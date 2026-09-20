/**
 * The last of the Paragraph, Format and Edit items: task lists, footnotes,
 * front matter, code tools and hyperlink actions.
 *
 * Two items in this area are deliberately left unimplemented rather than
 * approximated, and both for the same reason — the editor's schema has no node
 * for them, so anything built here would look right on screen and turn into
 * something else the moment the file was saved:
 *
 * - **Math Block.** The schema has `math_inline` and no block equivalent.
 * - **Link Reference.** Reference links parse, but the definition is inlined on
 *   serialize; the corpus test lists it among the constructs we knowingly
 *   normalize. A command to *create* one would be undone by the first save.
 *
 * Faking either would trade a greyed menu item for silent data loss.
 */
import { editorViewCtx } from '@milkdown/kit/core'
import { TextSelection, NodeSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { activeDoc } from '../stores/documents'
import { activeEditor } from '../editor/pool'
import { showNotice } from '../stores/ui'
import { registerAll, invalidateCommands, type Command } from './registry'

const hasEditor = (): boolean => activeDoc.value !== null && activeEditor() !== null

function withView(fn: (view: EditorView) => void): void {
  const handle = activeEditor()
  if (!handle) return
  handle.crepe.editor.action((ctx) => {
    try {
      const view = ctx.get(editorViewCtx)
      fn(view)
      view.focus()
    } catch {
      // The view can be mid-teardown during a document switch.
    }
  })
}

/** Reads something out of the active view without changing it. */
function fromView<T>(fn: (view: EditorView) => T, fallback: T): T {
  const handle = activeEditor()
  if (!handle) return fallback
  let out = fallback
  handle.crepe.editor.action((ctx) => {
    try {
      out = fn(ctx.get(editorViewCtx))
    } catch {
      out = fallback
    }
  })
  return out
}

/** The nearest ancestor of the given type, with its position. */
function ancestor(
  view: EditorView,
  name: string
): { node: ProseNode; pos: number; depth: number } | null {
  const { $from } = view.state.selection
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (node.type.name === name) return { node, pos: $from.before(d), depth: d }
  }
  return null
}

// --- Task lists -----------------------------------------------------------
//
// A task item is an ordinary list item carrying a `checked` attribute: null
// means it is not a task at all, false an open box, true a ticked one. So
// there is no separate node to insert — only an attribute to set, which is why
// these are three variations on the same operation.

/** Sets `checked` on the list item containing the caret. */
function setChecked(value: boolean | null): void {
  withView((view) => {
    const item = ancestor(view, 'list_item')
    if (!item) return
    view.dispatch(view.state.tr.setNodeMarkup(item.pos, undefined, {
      ...item.node.attrs,
      checked: value,
    }))
  })
}

const inListItem = (): boolean => fromView((v) => ancestor(v, 'list_item') !== null, false)

/** null when the caret is not in a list item at all. */
const checkedState = (): boolean | null | undefined =>
  fromView((v) => ancestor(v, 'list_item')?.node.attrs.checked as boolean | null, null)

const isTask = (): boolean => {
  const state = checkedState()
  return state === true || state === false
}

const taskChecked = (): boolean => checkedState() === true

// --- Footnotes ------------------------------------------------------------

/**
 * Inserts a footnote reference and the definition it points at.
 *
 * The definition goes at the end of the document, which is where footnotes
 * belong in the rendered output and where every markdown reader expects to
 * find them. The caret lands in the definition, because an empty footnote is
 * not worth inserting on its own.
 */
function insertFootnote(): void {
  withView((view) => {
    const { state } = view
    const reference = state.schema.nodes.footnote_reference
    const definition = state.schema.nodes.footnote_definition
    if (!reference || !definition) return

    // Numbered by how many already exist, so labels stay unique without
    // needing to parse what is there.
    let count = 0
    state.doc.descendants((n) => {
      if (n.type.name === 'footnote_definition') count++
    })
    const label = String(count + 1)

    const tr = state.tr.replaceSelectionWith(reference.create({ label }), false)
    const body = definition.create({ label }, state.schema.nodes.paragraph.create())
    const end = tr.doc.content.size
    tr.insert(end, body)
    // Inside the definition's paragraph: two positions past its start, past
    // the definition node and the paragraph node.
    tr.setSelection(TextSelection.create(tr.doc, end + 2))
    view.dispatch(tr)
  })
}

// --- Front matter ---------------------------------------------------------

const hasFrontMatter = (): boolean =>
  fromView((v) => v.state.doc.firstChild?.type.name === 'frontmatter', false)

/**
 * Adds or removes the YAML block at the top of the document.
 *
 * Checkable, and the check is the document's own state rather than a setting:
 * front matter either is or is not there.
 */
function toggleFrontMatter(): void {
  withView((view) => {
    const { state } = view
    const type = state.schema.nodes.frontmatter
    if (!type) return

    const first = state.doc.firstChild
    if (first?.type.name === 'frontmatter') {
      view.dispatch(state.tr.delete(0, first.nodeSize))
      return
    }

    // A starter key, because an empty block serializes to `---\n---` and reads
    // as a mistake rather than as something waiting to be filled in.
    const tr = state.tr.insert(0, type.create(null, state.schema.text('title: ')))
    tr.setSelection(TextSelection.create(tr.doc, tr.doc.content.size > 0 ? 8 : 1))
    view.dispatch(tr)
  })
  invalidateCommands()
}

// --- Code tools -----------------------------------------------------------

const inCodeBlock = (): boolean => fromView((v) => ancestor(v, 'code_block') !== null, false)

/**
 * Copies the code block's text.
 *
 * Its own command rather than a plain copy: the caret is inside a CodeMirror
 * instance, so a document-level copy would take whatever is selected there
 * instead of the whole fence.
 */
function copyCode(): void {
  const text = fromView((v) => ancestor(v, 'code_block')?.node.textContent ?? '', '')
  if (!text) return
  void navigator.clipboard.writeText(text)
  showNotice('Code copied')
}

/**
 * Focuses the block's own language picker.
 *
 * The list of languages belongs to the code block component, which already
 * renders a picker; reimplementing it here would mean keeping a second list of
 * languages in step with its.
 */
function setLanguage(): void {
  withView((view) => {
    const block = ancestor(view, 'code_block')
    if (!block) return
    // The node's own DOM, not a document-wide query: with several code blocks
    // open, the first match would belong to the wrong one.
    const dom = view.nodeDOM(block.pos)
    const button =
      dom instanceof HTMLElement ? dom.querySelector<HTMLElement>('.language-button') : null
    if (!button) {
      showNotice('This code block has no language picker.', 'error')
      return
    }
    button.click()
  })
}

// --- Hyperlink actions ----------------------------------------------------

/** The link mark covering the caret, if there is one. */
function linkAt(view: EditorView): { href: string; from: number; to: number } | null {
  const { state } = view
  const { $from } = state.selection
  const type = state.schema.marks.link
  if (!type) return null

  const mark = $from.marks().find((m) => m.type === type)
  if (!mark) return null

  // Walk out to the mark's edges: the menu acts on the whole link, not on the
  // character the caret happens to sit against.
  const parent = $from.parent
  const offset = $from.parentOffset
  let from = $from.pos
  let to = $from.pos
  parent.forEach((child, childOffset) => {
    const start = childOffset
    const end = childOffset + child.nodeSize
    if (offset >= start && offset <= end && type.isInSet(child.marks)) {
      from = $from.start() + start
      to = $from.start() + end
    }
  })
  return { href: String(mark.attrs.href ?? ''), from, to }
}

const onLink = (): boolean => fromView((v) => linkAt(v) !== null, false)

function openLink(): void {
  const href = fromView((v) => linkAt(v)?.href ?? '', '')
  if (!href) return
  // Through main, which opens it in the system browser. The renderer blocks
  // navigation outright, so window.open here would do nothing.
  void window.api.app.openExternal(href)
}

function removeLink(): void {
  withView((view) => {
    const found = linkAt(view)
    const type = view.state.schema.marks.link
    if (!found || !type) return
    view.dispatch(view.state.tr.removeMark(found.from, found.to, type))
  })
}

// --- Images ---------------------------------------------------------------

/** The image node the selection is on, whichever of the two kinds it is. */
function selectedImage(view: EditorView): ProseNode | null {
  const { selection } = view.state
  if (selection instanceof NodeSelection) {
    const name = selection.node.type.name
    if (name === 'image' || name === 'image-block') return selection.node
  }
  let found: ProseNode | null = null
  view.state.doc.nodesBetween(selection.from, selection.to, (node) => {
    if (!found && (node.type.name === 'image' || node.type.name === 'image-block')) found = node
  })
  return found
}

const onImage = (): boolean => fromView((v) => selectedImage(v) !== null, false)

/**
 * Copies the image itself, not its markdown.
 *
 * Read through a canvas because the clipboard takes a blob: the source is a
 * local file or a remote URL, and neither is something the clipboard accepts
 * directly.
 */
async function copyImageContent(): Promise<void> {
  const src = fromView((v) => String(selectedImage(v)?.attrs.src ?? ''), '')
  if (!src) return

  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('could not load the image'))
      img.src = src
    })

    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    canvas.getContext('2d')?.drawImage(img, 0, 0)

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('could not read the image')

    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    showNotice('Image copied')
  } catch (err) {
    showNotice(`Could not copy the image: ${String(err)}`, 'error')
  }
}

/** Reports what the document records about the image. */
function imageProperties(): void {
  const info = fromView(
    (v) => {
      const node = selectedImage(v)
      if (!node) return ''
      const alt = String(node.attrs.alt ?? '') || 'none'
      const title = String(node.attrs.caption ?? node.attrs.title ?? '') || 'none'
      return `${node.attrs.src} — alt: ${alt}, title: ${title}`
    },
    ''
  )
  if (info) showNotice(info)
}

const contentCommands: Command[] = [
  // Task lists. Wrapping is the list commands' job; these three own the
  // attribute that makes a list item a task.
  {
    id: 'para.taskList',
    enabled: inListItem,
    checked: isTask,
    run: () => setChecked(isTask() ? null : false),
  },
  { id: 'para.taskDone', enabled: isTask, checked: taskChecked, run: () => setChecked(true) },
  {
    id: 'para.taskTodo',
    enabled: isTask,
    checked: () => isTask() && !taskChecked(),
    run: () => setChecked(false),
  },

  { id: 'para.footnote', enabled: hasEditor, run: insertFootnote },
  { id: 'para.frontMatter', enabled: hasEditor, checked: hasFrontMatter, run: toggleFrontMatter },

  { id: 'para.copyCode', enabled: inCodeBlock, run: copyCode },
  { id: 'para.setLanguage', enabled: inCodeBlock, run: setLanguage },

  { id: 'format.openLink', enabled: onLink, run: openLink },
  { id: 'format.removeLink', enabled: onLink, run: removeLink },

  { id: 'format.imageProperties', enabled: onImage, run: imageProperties },
  { id: 'edit.copyImage', enabled: onImage, run: copyImageContent },
]

export function registerContentCommands(): void {
  registerAll(contentCommands)
}
