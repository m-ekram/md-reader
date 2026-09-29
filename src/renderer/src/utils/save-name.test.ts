import { describe, expect, it } from 'vitest'
import { safeFileName, suggestSavePath } from './save-name'

const untitled = (content: string) => ({ path: null, name: 'Untitled 2', content })

describe('suggestSavePath', () => {
  it('names an Untitled document after its first heading', () => {
    expect(suggestSavePath(untitled('Intro text\n\n# Trip to Lisbon\n\nMore'), null)).toBe(
      'Trip to Lisbon.md'
    )
  })

  it('puts it in the open folder', () => {
    expect(suggestSavePath(untitled('# Plans'), 'C:\\notes')).toBe('C:\\notes\\Plans.md')
    expect(suggestSavePath(untitled('# Plans'), 'C:\\notes\\')).toBe('C:\\notes\\Plans.md')
  })

  it('falls back to the tab name when there is no heading', () => {
    expect(suggestSavePath(untitled('Just a line.'), null)).toBe('Untitled 2.md')
  })

  it('ignores a heading inside a code block', () => {
    expect(suggestSavePath(untitled('```sh\n# a comment\n```\n\n## Real'), null)).toBe('Real.md')
  })

  it('keeps a saved document where it is', () => {
    const doc = { path: 'D:\\docs\\a.md', name: 'a.md', content: '# Other' }
    expect(suggestSavePath(doc, 'C:\\notes')).toBe('D:\\docs\\a.md')
  })
})

describe('safeFileName', () => {
  it('drops markdown and the characters Windows refuses in a name', () => {
    expect(safeFileName('What *is* `this`: a/b <test>?')).toBe('What is this a b test')
  })

  it('drops trailing dots and spaces, which Windows strips silently', () => {
    expect(safeFileName('The end... ')).toBe('The end')
  })

  it('avoids the names Windows reserves for devices', () => {
    expect(safeFileName('CON')).toBe('CON_')
    expect(safeFileName('com1')).toBe('com1_')
  })

  it('keeps a long title to a sensible length', () => {
    expect(safeFileName('word '.repeat(40)).length).toBeLessThanOrEqual(80)
  })

  it('turns a link into its text', () => {
    expect(safeFileName('See [the plan](https://example.com)')).toBe('See the plan')
  })

  it('gives nothing for a heading with nothing usable', () => {
    expect(safeFileName('???')).toBe('')
  })
})
