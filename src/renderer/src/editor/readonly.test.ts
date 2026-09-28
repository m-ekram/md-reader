import { describe, it, expect, afterEach } from 'vitest'
import { editorViewCtx } from '@milkdown/kit/core'
import type { EditorView } from '@milkdown/kit/prose/view'
import { createEditor, type EditorHandle } from './crepe'

/**
 * A readonly document refuses changes made to it directly, not only typing.
 *
 * Crepe's readonly turns off typing in the page, and commands used to go
 * straight past it: a shortcut made a Help page bold and then asked whether to
 * save it. The commands are now greyed out as well, and that is tested end to
 * end; this is the editor's own refusal, for any change that reaches the
 * document some other way.
 */
let handle: EditorHandle | undefined
let root: HTMLElement | undefined

afterEach(async () => {
  await handle?.destroy()
  root?.remove()
})

async function editor(): Promise<EditorView> {
  root = document.createElement('div')
  document.body.appendChild(root)
  handle = await createEditor({ root, value: 'Help text.', onChange: () => {} })
  let view!: EditorView
  handle.crepe.editor.action((ctx) => {
    view = ctx.get(editorViewCtx)
  })
  return view
}

describe('a readonly document', () => {
  it('does not change, whatever asks it to', async () => {
    const view = await editor()
    handle!.setReadonly(true)
    view.dispatch(view.state.tr.insertText('Changed. ', 1))
    expect(view.state.doc.textContent).toBe('Help text.')
  }, 60_000)

  it('changes again once it is editable', async () => {
    const view = await editor()
    handle!.setReadonly(true)
    handle!.setReadonly(false)
    view.dispatch(view.state.tr.insertText('Changed. ', 1))
    expect(view.state.doc.textContent).toBe('Changed. Help text.')
  }, 60_000)
})
