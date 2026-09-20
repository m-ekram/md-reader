// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { extractHeadings, plainHeadingText } from './outline'

describe('extractHeadings', () => {
  it('reads ATX headings with their levels and lines', () => {
    const md = '# One\n\n## Two\n\ntext\n\n### Three'
    expect(extractHeadings(md)).toEqual([
      { level: 1, text: 'One', line: 1 },
      { level: 2, text: 'Two', line: 3 },
      { level: 3, text: 'Three', line: 7 },
    ])
  })

  it('ignores hashes inside fenced code blocks', () => {
    // The common failure: every shell script in a notes folder is full of
    // comment lines that look exactly like headings.
    const md = '# Real\n\n```bash\n# not a heading\n## also not\n```\n\n## Also real'
    expect(extractHeadings(md).map((h) => h.text)).toEqual(['Real', 'Also real'])
  })

  it('handles tilde fences and longer fences', () => {
    const md = '~~~\n# hidden\n~~~\n\n````\n# also hidden\n````\n\n# visible'
    expect(extractHeadings(md).map((h) => h.text)).toEqual(['visible'])
  })

  it('does not treat front matter as headings or a setext underline', () => {
    const md = '---\ntitle: Test\n---\n\n# Body heading'
    expect(extractHeadings(md)).toEqual([{ level: 1, text: 'Body heading', line: 5 }])
  })

  it('reads setext headings, pointing at the text line', () => {
    const md = 'Title\n=====\n\nSubtitle\n--------'
    expect(extractHeadings(md)).toEqual([
      { level: 1, text: 'Title', line: 1 },
      { level: 2, text: 'Subtitle', line: 4 },
    ])
  })

  it('does not mistake a thematic break or list for a setext heading', () => {
    expect(extractHeadings('text\n\n---\n\nmore')).toEqual([])
    expect(extractHeadings('- item\n--')).toEqual([])
  })

  it('strips trailing closing hashes', () => {
    expect(extractHeadings('## Heading ##')[0].text).toBe('Heading')
  })

  it('ignores an empty heading', () => {
    expect(extractHeadings('#\n\n##   ')).toEqual([])
  })

  it('requires a space after the hashes', () => {
    expect(extractHeadings('#NotAHeading')).toEqual([])
  })

  it('returns nothing for an empty document', () => {
    expect(extractHeadings('')).toEqual([])
  })
})

describe('plainHeadingText', () => {
  it('strips inline markup so the outline reads as text', () => {
    expect(plainHeadingText('**Bold** and *italic*')).toBe('Bold and italic')
    expect(plainHeadingText('`code` heading')).toBe('code heading')
    expect(plainHeadingText('A [link](http://x.com) here')).toBe('A link here')
    expect(plainHeadingText('~~struck~~ out')).toBe('struck out')
  })
})
