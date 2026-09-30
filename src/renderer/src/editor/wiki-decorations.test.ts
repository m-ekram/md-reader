import { describe, expect, it } from 'vitest'
import { Schema } from '@milkdown/kit/prose/model'
import { EditorState, TextSelection } from '@milkdown/kit/prose/state'
import { wikiLinkKey, wikiLinkPlugin, parseWikiTarget } from './wiki-decorations'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    code_block: { group: 'block', content: 'text*', code: true, toDOM: () => ['pre', 0] },
    image: { group: 'inline', inline: true, toDOM: () => ['img'] },
    text: { group: 'inline' },
  },
})

const p = (...parts: Array<string | 'IMG'>) =>
  schema.node(
    'paragraph',
    null,
    parts.map((t) => (t === 'IMG' ? schema.node('image') : schema.text(t)))
  )

function stateOf(...blocks: ReturnType<typeof p>[]) {
  return EditorState.create({ doc: schema.node('doc', null, blocks), plugins: [wikiLinkPlugin()] })
}

/** The links decorated, as the text each covers. */
function links(state: EditorState): string[] {
  const set = wikiLinkKey.getState(state)!
  return set.find().map((d) => state.doc.textBetween(d.from, d.to))
}

describe('wiki link decorations', () => {
  it('marks each [[link]] in the text', () => {
    // They were plain text, looking like any other brackets.
    const state = stateOf(
      p('See [[Trip plan]] and [[notes/Other#Day 2|day two]].'),
      p('None here.')
    )
    expect(links(state)).toEqual(['[[Trip plan]]', '[[notes/Other#Day 2|day two]]'])
  })

  it('finds links after an image in the same line', () => {
    const state = stateOf(p('A ', 'IMG', ' then [[After]].'))
    expect(links(state)).toEqual(['[[After]]'])
  })

  it('leaves code alone', () => {
    const state = stateOf(schema.node('code_block', null, schema.text('x = [[1]]')))
    expect(links(state)).toEqual([])
  })

  it('follows edits: a link typed, one broken, and the rest kept', () => {
    let state = stateOf(p('First [[One]].'), p('Second.'))
    // Typing a link into the second paragraph.
    const end = state.doc.content.size - 2
    state = state.apply(state.tr.insertText(' [[Two]]', end))
    expect(links(state)).toEqual(['[[One]]', '[[Two]]'])
    // Breaking the first one: its closing brackets deleted.
    const at = state.doc.textBetween(0, state.doc.content.size, '\n').indexOf(']].')
    state = state.apply(state.tr.delete(at + 1, at + 3))
    expect(links(state)).toEqual(['[[Two]]'])
  })

  it('does not rescan for a change that moves only the caret', () => {
    const state = stateOf(p('A [[Link]].'))
    const before = wikiLinkKey.getState(state)
    const moved = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 3)))
    expect(wikiLinkKey.getState(moved)).toBe(before)
  })
})

describe('parseWikiTarget', () => {
  it('splits a target into the note, heading and label', () => {
    expect(parseWikiTarget('[[notes/Trip#Day 2|the second day]]')).toEqual({
      name: 'notes/Trip',
      heading: 'Day 2',
      label: 'the second day',
    })
    expect(parseWikiTarget('[[Plain]]')).toEqual({ name: 'Plain', heading: '', label: '' })
  })
})
