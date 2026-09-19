# Phase 0 - Crepe round-trip (shipping config)

Crepe 7.22.1, all features except AI and TopBar, tuned serializer.

**Lossless: 31/43**

| construct | result | note |
|---|---|---|
| atx headings | ok |  |
| paragraph | ok |  |
| emphasis | ok |  |
| strikethrough (gfm) | ok |  |
| inline code | ok |  |
| code fence (lang) | ok |  |
| code fence (no lang) | ok |  |
| blockquote | ok |  |
| nested blockquote | ok |  |
| unordered list | ok |  |
| ordered list | ok |  |
| nested list | ok |  |
| mixed nested list | ok |  |
| task list (gfm) | ok |  |
| loose list | ok |  |
| table (gfm) | LOSSY | delimiter row collapses to | - |; content preserved |
| table alignment | LOSSY | cell padding normalized; alignment preserved |
| link | ok |  |
| link with title | ok |  |
| reference link | LOSSY | definition inlined; link target preserved |
| autolink | ok |  |
| image | LOSSY | **UNPLANNED** |
| thematic break | ok |  |
| hard line break | LOSSY | two-space break becomes backslash; renders identically |
| backslash break | ok |  |
| escaped chars | ok |  |
| literal asterisk (unescaped) | LOSSY | serializer adds protective escapes |
| html entity | LOSSY | entities decoded to literal characters; renders identically |
| setext heading | LOSSY | normalizes to ATX |
| inline html | ok |  |
| html comment | ok |  |
| html block | ok |  |
| footnote (gfm) | ok |  |
| yaml front matter | LOSSY | Phase 3 custom node |
| inline math | ok |  |
| block math | ok |  |
| mermaid fence | ok |  |
| github alert | LOSSY | Phase 3 custom node |
| toc directive | LOSSY | Phase 3 custom node |
| emoji shortcode | ok |  |
| unicode + cjk | ok |  |
| indented code block | LOSSY | often normalized to fences |
| long paragraph (no rewrap) | ok |  |

## Lossy detail

### table (gfm)

```markdown
| a | b |
| - | - |
| 1 | 2 |

```

### table alignment

```markdown
| l  |  c  |  r |
| :- | :-: | -: |
| 1  |  2  |  3 |

```

### reference link

```markdown
See [the docs](https://example.com).

```

### image

```markdown
![1.00](./img/pic.png)

```

### hard line break

```markdown
line one\
line two

```

### literal asterisk (unescaped)

```markdown
A literal \* asterisk and \_ underscore.

```

### html entity

```markdown
Café & bar

```

### setext heading

```markdown
# Title

## Sub

```

### yaml front matter

```markdown
---

title: Test
tags: \[a, b]
-------------

Body text.

```

### github alert

```markdown
> \[!NOTE]
> Useful information.

```

### toc directive

```markdown
\[TOC]

# Heading

```

### indented code block

```markdown
Text:

```
indented code
second line
```

```
