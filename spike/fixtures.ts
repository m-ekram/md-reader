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
  {
    name: 'atx headings',
    md: '# One\n\n## Two\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six',
  },
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
  {
    name: 'table (gfm)',
    expectedGap: 'delimiter row collapses to | - |; content preserved',
    md: '| a | b |\n| --- | --- |\n| 1 | 2 |',
  },
  {
    name: 'table alignment',
    expectedGap: 'cell padding normalized; alignment preserved',
    md: '| l | c | r |\n| :-- | :-: | --: |\n| 1 | 2 | 3 |',
  },
  { name: 'link', md: 'See [the docs](https://example.com).' },
  { name: 'link with title', md: 'See [docs](https://example.com "Title").' },
  {
    name: 'reference link',
    expectedGap: 'definition inlined; link target preserved',
    md: 'See [the docs][ref].\n\n[ref]: https://example.com',
  },
  { name: 'autolink', md: 'Visit <https://example.com> today.' },
  { name: 'image', md: '![alt text](./img/pic.png)' },
  { name: 'thematic break', md: 'before\n\n---\n\nafter' },
  {
    name: 'hard line break',
    expectedGap: 'two-space break becomes backslash; renders identically',
    md: 'line one  \nline two',
  },
  { name: 'backslash break', md: 'line one\\nline two' },
  { name: 'escaped chars', md: String.raw`A literal \* asterisk and \_ underscore.` },
  {
    name: 'literal asterisk (unescaped)',
    expectedGap: 'serializer adds protective escapes',
    md: 'A literal * asterisk and _ underscore.',
  },
  {
    name: 'html entity',
    expectedGap: 'entities decoded to literal characters; renders identically',
    md: 'Caf&eacute; &amp; bar',
  },
  { name: 'setext heading', expectedGap: 'normalizes to ATX', md: 'Title\n=====\n\nSub\n---' },
  {
    name: 'inline html',
    expectedGap: 'Format > Underline emits this',
    md: 'Some <u>underlined</u> text.',
  },
  {
    name: 'html comment',
    expectedGap: 'Format > Comment emits this',
    md: '<!-- a note to self -->',
  },
  {
    name: 'html block',
    expectedGap: 'raw html passthrough',
    md: '<div align="center">\n  hi\n</div>',
  },
  {
    name: 'footnote (gfm)',
    expectedGap: 'may need footnote plugin',
    md: 'Text with a note[^1].\n\n[^1]: The note.',
  },
  {
    name: 'yaml front matter',
    expectedGap: 'Phase 3 custom node',
    md: '---\ntitle: Test\ntags: [a, b]\n---\n\nBody text.',
  },
  {
    name: 'inline math',
    // Needs the latex plugin; bare commonmark escapes the LaTeX. The shipping
    // editor handles it, and corpus.test.ts enforces that.
    expectedGap: 'needs remark-math, which only the shipping config has',
    // String.raw, because an ordinary literal turns \pi into "pi" and the
    // fixture then tests math containing no LaTeX commands at all — which is
    // exactly what it did for several phases.
    md: String.raw`Euler: $e^{i\pi} + 1 = 0$.`,
  },
  {
    name: 'block math',
    expectedGap: 'needs remark-math, which only the shipping config has',
    md: String.raw`$$` + '\n' + String.raw`\int_0^1 x^2 dx` + '\n' + String.raw`$$`,
  },
  {
    name: 'mermaid fence',
    expectedGap: 'Phase 3 custom node',
    md: '```mermaid\ngraph TD\n  A-->B\n```',
  },
  {
    name: 'github alert',
    expectedGap: 'Phase 3 custom node',
    md: '> [!NOTE]\n> Useful information.',
  },
  { name: 'toc directive', expectedGap: 'Phase 3 custom node', md: '[TOC]\n\n# Heading' },
  { name: 'emoji shortcode', md: 'Ship it :rocket:' },
  {
    name: 'wiki links',
    expectedGap: 'kept by the app, editor/wiki-links.ts',
    md: 'See [[Note]], [[Note|alias]] and [[Note#Heading]].\n\n[[Start]] of a line, **[[bold link]]**, [[my_note]] and [[a*b]].',
  },
  {
    name: 'wiki link in a heading and a list',
    expectedGap: 'kept by the app, editor/wiki-links.ts',
    md: '# Heading with [[Link]]\n\n- item [[Link]]\n- [ ] task [[Link]]',
  },
  {
    name: 'wiki link in a quote',
    expectedGap: 'kept by the app, editor/wiki-links.ts',
    md: '> quote [[Link]]',
  },
  {
    name: 'wiki link in a table',
    expectedGap: 'kept by the app, editor/wiki-links.ts',
    // Padded as the serializer pads a table, which is a separate matter
    // (see "table (gfm)"): what is tested here is the link's `\|`.
    md: '| a        | b |\n| -------- | - |\n| [[N\\|x]] | 2 |',
  },
  {
    name: 'escaped wiki link',
    expectedGap: 'parsed as the same text as a link, so written back as one',
    md: 'Not a link: \\[\\[x]].',
  },
  { name: 'unicode + cjk', md: 'Unicode: café, naïve, 日本語, emoji 🎉' },
  {
    name: 'indented code block',
    expectedGap: 'often normalized to fences',
    md: 'Text:\n\n    indented code\n    second line',
  },
  {
    name: 'long paragraph (no rewrap)',
    md: 'A '.repeat(60).trim() + ' end of a deliberately long line that must not be re-wrapped.',
  },
]
