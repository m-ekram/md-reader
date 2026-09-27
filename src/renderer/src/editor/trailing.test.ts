import { describe, it, expect, afterEach } from 'vitest'
import { editorViewCtx } from '@milkdown/kit/core'
import { TextSelection } from '@milkdown/kit/prose/state'
import { createEditor, type EditorHandle } from './crepe'

/**
 * Opening a file must not change it.
 *
 * Crepe appends an empty paragraph after a document's last block when that
 * block is a list, a code block, a table or a quote, so the caret has somewhere
 * to go. It does so on the first transaction of any kind — a click is enough —
 * and the paragraph serialized as one extra newline. Every file ending in one
 * of those blocks was therefore modified by being opened: dirty at once,
 * prompting to save on close, and rewritten by a save.
 *
 * The round-trip guard could not see it, because it parses and re-serializes
 * directly, without the plugins that run in a live editor.
 */
const SHAPES: Record<string, string> = {
  list: '# Heading\n\nSome text.\n\n- one\n- two\n',
  'ordered list': 'Steps:\n\n1. first\n2. second\n',
  'code block': 'Text.\n\n```js\nconst x = 1\n```\n',
  quote: 'Text.\n\n> quoted\n',
  table: '| a |\n| - |\n| 1 |\n',
}

let handle: EditorHandle | null = null
let root: HTMLElement | null = null

afterEach(async () => {
  await handle?.destroy()
  root?.remove()
  handle = null
  root = null
})

async function open(markdown: string, changes: string[] = []): Promise<EditorHandle> {
  root = document.createElement('div')
  document.body.appendChild(root)
  handle = await createEditor({ root, value: markdown, onChange: (m) => changes.push(m) })
  return handle
}

/** A transaction that changes nothing, as a click or a selection change does. */
function touch(h: EditorHandle): void {
  h.crepe.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    view.dispatch(view.state.tr.setMeta('touch', true))
  })
}

describe('a document ending in a block the trailing plugin follows', () => {
  it.each(Object.entries(SHAPES))('%s: reads back byte for byte after a touch', async (_, md) => {
    const h = await open(md)
    touch(h)

    // The plugin did append its paragraph — this is what makes the test real —
    const last = await new Promise<string>((resolve) =>
      h.crepe.editor.action((ctx) => resolve(ctx.get(editorViewCtx).state.doc.lastChild!.type.name))
    )
    expect(last).toBe('paragraph')
    // …and it is not part of the file.
    expect(h.getMarkdown()).toBe(md)
  })

  it('never reports the file as changed for the paragraph alone', async () => {
    // The path that dirtied real documents: the plugin's paragraph was
    // reported, a moment later, as markdown with an extra newline. Now a
    // change that serialises the same is not reported at all.
    const changes: string[] = []
    const h = await open(SHAPES.list, changes)
    touch(h)
    // Past the pause after which edits are reported, then a forced report.
    await new Promise((r) => setTimeout(r, 800))
    h.flush()
    for (const reported of changes) expect(reported).toBe(SHAPES.list)

    // Non-vacuous: the same path does report a real edit.
    h.crepe.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      view.dispatch(view.state.tr.insertText('Edited. ', 1))
    })
    h.flush()
    expect(changes.at(-1), 'a real edit is reported').toContain('Edited.')
  })

  it('keeps what the user types into that final paragraph', async () => {
    const h = await open(SHAPES.list)
    touch(h)
    h.crepe.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const end = view.state.doc.content.size - 1
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, end)).insertText('After.')
      )
    })
    // Now it is content, so it must be written.
    expect(h.getMarkdown()).toBe(`${SHAPES.list}\nAfter.\n`)
  })
})
