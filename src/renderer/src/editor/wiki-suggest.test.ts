import { describe, expect, it } from 'vitest'
import { Schema } from '@milkdown/kit/prose/model'
import { EditorState, TextSelection } from '@milkdown/kit/prose/state'
import { insertWikiLink, wikiQueryAt } from './wiki-suggest'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    code_block: { group: 'block', content: 'text*', code: true, toDOM: () => ['pre', 0] },
    text: { group: 'inline' },
  },
  marks: {
    inlineCode: { code: true, toDOM: () => ['code', 0] },
  },
})

/** A paragraph of `text`, with the caret where the last `|` is. */
function at(text: string, block: 'paragraph' | 'code_block' = 'paragraph'): EditorState {
  const caret = text.lastIndexOf('|')
  const plain = text.slice(0, caret) + text.slice(caret + 1)
  const doc = schema.node('doc', null, [
    schema.node(block, null, plain ? [schema.text(plain)] : []),
  ])
  const state = EditorState.create({ doc })
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1 + caret)))
}

const text = (s: EditorState) => s.doc.textContent
const caret = (s: EditorState) => s.selection.from - 1

describe('wikiQueryAt', () => {
  it('finds the name being typed after [[', () => {
    expect(wikiQueryAt(at('See [[Lis|'))).toEqual({ query: 'Lis', from: 7, to: 10 })
    expect(wikiQueryAt(at('[[|'))).toEqual({ query: '', from: 3, to: 3 })
    expect(wikiQueryAt(at('[[trips/Po|'))?.query).toBe('trips/Po')
  })

  it('finds nothing once the link is closed, past a | or #, or without [[', () => {
    expect(wikiQueryAt(at('[[Lisbon]] |'))).toBeNull()
    expect(wikiQueryAt(at('[[Lisbon|la|'))).toBeNull()
    expect(wikiQueryAt(at('[[Lisbon#Da|'))).toBeNull()
    expect(wikiQueryAt(at('[Lis|'))).toBeNull()
  })

  it('finds nothing in code', () => {
    expect(wikiQueryAt(at('x = [[1|', 'code_block'))).toBeNull()
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('[[a', [schema.marks.inlineCode.create()])]),
    ])
    const s = EditorState.create({ doc })
    expect(wikiQueryAt(s.apply(s.tr.setSelection(TextSelection.create(s.doc, 4))))).toBeNull()
  })

  it('finds nothing with a range selected', () => {
    const s = at('[[Lis|')
    expect(wikiQueryAt(s.apply(s.tr.setSelection(TextSelection.create(s.doc, 3, 6))))).toBeNull()
  })
})

describe('insertWikiLink', () => {
  const accept = (s: EditorState, insert: string) =>
    s.apply(insertWikiLink(s, wikiQueryAt(s)!, insert))

  it('completes the name and closes the link', () => {
    const s = accept(at('See [[Lis| now'), 'Lisbon')
    expect(text(s)).toBe('See [[Lisbon]] now')
    expect(caret(s)).toBe('See [[Lisbon]]'.length)
  })

  it('does not close it twice', () => {
    // Editing a link already closed replaces its name, brackets untouched.
    const s = accept(at('See [[Li|sb]] now'), 'Lisbon')
    expect(text(s)).toBe('See [[Lisbon]] now')
    expect(caret(s)).toBe('See [[Lisbon]]'.length)
  })

  it('keeps a label or heading after the name', () => {
    const s = accept(at('[[Po|rt#Day 2]]'), 'trips/Porto')
    expect(text(s)).toBe('[[trips/Porto#Day 2]]')
    expect(caret(s)).toBe('[[trips/Porto'.length)
  })
})
