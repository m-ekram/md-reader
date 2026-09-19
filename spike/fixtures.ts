/**
 * One fixture per markdown construct. When a round-trip fails, the fixture name
 * tells us precisely which construct we cannot represent losslessly.
 */
export interface Fixture {
  name: string
  /** Constructs we already know need work beyond commonmark+gfm. */
  expectedGap?: string
  md: string
}

export const fixtures: Fixture[] = [
  { name: 'atx headings', md: '# One\n\n## Two\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six' },
  { name: 'paragraph', md: 'Just a plain paragraph of text.' },
  { name: 'emphasis', md: 'Some *italic*, **bold**, and ***both*** here.' },
  { name: 'strikethrough (gfm)', md: 'This is ~~struck out~~ text.' },
  { name: 'inline code', md: 'Use the `printf()` function.' },
  { name: 'code fence (lang)', md: '```ts\nconst a: number = 1\n```' },
  { name: 'code fence (no lang)', md: '```\nplain block\n```' },
  { name: 'blockquote', md: '> Quoted line one\n> quoted line two' },
  { name: 'nested blockquote', md: '> outer\n>\n> > inner' },
  { name: 'unordered list', md: '- one\n- two\n- three' },
  { name: 'ordered list', md: '1. one\n2. two\n3. three' },
  { name: 'nested list', md: '- top\n  - middle\n    - bottom' },
  { name: 'mixed nested list', md: '1. first\n   - bullet\n   - bullet\n2. second' },
  { name: 'task list (gfm)', md: '- [ ] todo\n- [x] done' },
  { name: 'loose list', md: '- one\n\n- two\n\n- three' },
  { name: 'table (gfm)', expectedGap: 'delimiter row collapses to | - |; content preserved', md: '| a | b |\n| --- | --- |\n| 1 | 2 |' },
  { name: 'table alignment', expectedGap: 'cell padding normalized; alignment preserved', md: '| l | c | r |\n| :-- | :-: | --: |\n| 1 | 2 | 3 |' },
  { name: 'link', md: 'See [the docs](https://example.com).' },
  { name: 'link with title', md: 'See [docs](https://example.com "Title").' },
  { name: 'reference link', expectedGap: 'definition inlined; link target preserved', md: 'See [the docs][ref].\n\n[ref]: https://example.com' },
  { name: 'autolink', md: 'Visit <https://example.com> today.' },
  { name: 'image', md: '![alt text](./img/pic.png)' },
  { name: 'thematic break', md: 'before\n\n---\n\nafter' },
  { name: 'hard line break', expectedGap: 'two-space break becomes backslash; renders identically', md: 'line one  \nline two' },
  { name: 'backslash break', md: 'line one\\nline two' },
  { name: 'escaped chars', md: String.raw`A literal \* asterisk and \_ underscore.` },
  { name: 'literal asterisk (unescaped)', expectedGap: 'serializer adds protective escapes', md: 'A literal * asterisk and _ underscore.' },
  { name: 'html entity', expectedGap: 'entities decoded to literal characters; renders identically', md: 'Caf&eacute; &amp; bar' },
  { name: 'setext heading', expectedGap: 'normalizes to ATX', md: 'Title\n=====\n\nSub\n---' },
  { name: 'inline html', expectedGap: 'Format > Underline emits this', md: 'Some <u>underlined</u> text.' },
  { name: 'html comment', expectedGap: 'Format > Comment emits this', md: '<!-- a note to self -->' },
  { name: 'html block', expectedGap: 'raw html passthrough', md: '<div align="center">\n  hi\n</div>' },
  { name: 'footnote (gfm)', expectedGap: 'may need footnote plugin', md: 'Text with a note[^1].\n\n[^1]: The note.' },
  { name: 'yaml front matter', expectedGap: 'Phase 3 custom node', md: '---\ntitle: Test\ntags: [a, b]\n---\n\nBody text.' },
  { name: 'inline math', expectedGap: 'Phase 3 (remark-math via Crepe latex)', md: 'Euler: $e^{i\pi} + 1 = 0$.' },
  { name: 'block math', expectedGap: 'Phase 3 (remark-math via Crepe latex)', md: '$$\n\int_0^1 x^2 dx\n$$' },
  { name: 'mermaid fence', expectedGap: 'Phase 3 custom node', md: '```mermaid\ngraph TD\n  A-->B\n```' },
  { name: 'github alert', expectedGap: 'Phase 3 custom node', md: '> [!NOTE]\n> Useful information.' },
  { name: 'toc directive', expectedGap: 'Phase 3 custom node', md: '[TOC]\n\n# Heading' },
  { name: 'emoji shortcode', md: 'Ship it :rocket:' },
  { name: 'unicode + cjk', md: 'Unicode: café, naïve, 日本語, emoji 🎉' },
  { name: 'indented code block', expectedGap: 'often normalized to fences', md: 'Text:\n\n    indented code\n    second line' },
  { name: 'long paragraph (no rewrap)', md: 'A '.repeat(60).trim() + ' end of a deliberately long line that must not be re-wrapped.' },
]
