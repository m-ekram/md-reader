# Phase 0 - round-trip findings

Measured against Milkdown/Crepe 7.22.1 with the commonmark + gfm presets.

- Lossless with Milkdown defaults: **25/43**
- Lossless with a tuned serializer: **31/43**
- Closed by serializer configuration alone: **6**

## Per-construct

| construct | default | tuned | note |
|---|---|---|---|
| atx headings | ok | ok |  |
| paragraph | ok | ok |  |
| emphasis | ok | ok |  |
| strikethrough (gfm) | ok | ok |  |
| inline code | ok | ok |  |
| code fence (lang) | ok | ok |  |
| code fence (no lang) | ok | ok |  |
| blockquote | ok | ok |  |
| nested blockquote | ok | ok |  |
| unordered list | lossy | ok | fixed by config |
| ordered list | ok | ok |  |
| nested list | lossy | ok | fixed by config |
| mixed nested list | lossy | ok | fixed by config |
| task list (gfm) | lossy | ok | fixed by config |
| loose list | lossy | ok | fixed by config |
| table (gfm) | lossy | lossy | delimiter row collapses to | - |; content preserved |
| table alignment | lossy | lossy | cell padding normalized; alignment preserved |
| link | ok | ok |  |
| link with title | ok | ok |  |
| reference link | lossy | lossy | definition inlined; link target preserved |
| autolink | ok | ok |  |
| image | ok | ok |  |
| thematic break | lossy | ok | fixed by config |
| hard line break | lossy | lossy | two-space break becomes backslash; renders identically |
| backslash break | ok | ok |  |
| escaped chars | ok | ok |  |
| literal asterisk (unescaped) | lossy | lossy | serializer adds protective escapes |
| html entity | lossy | lossy | entities decoded to literal characters; renders identically |
| setext heading | lossy | lossy | normalizes to ATX |
| inline html | ok | ok |  |
| html comment | ok | ok |  |
| html block | ok | ok |  |
| footnote (gfm) | ok | ok |  |
| yaml front matter | lossy | lossy | Phase 3 custom node |
| inline math | ok | ok |  |
| block math | lossy | lossy | needs remark-math, which only the shipping config has |
| mermaid fence | ok | ok |  |
| github alert | lossy | lossy | Phase 3 custom node |
| toc directive | lossy | lossy | Phase 3 custom node |
| emoji shortcode | ok | ok |  |
| unicode + cjk | ok | ok |  |
| indented code block | lossy | lossy | often normalized to fences |
| long paragraph (no rewrap) | ok | ok |  |

## Still lossy after tuning

### table (gfm)

Planned mitigation: delimiter row collapses to | - |; content preserved

```markdown
| a | b |
| - | - |
| 1 | 2 |

```

### table alignment

Planned mitigation: cell padding normalized; alignment preserved

```markdown
| l  |  c  |  r |
| :- | :-: | -: |
| 1  |  2  |  3 |

```

### reference link

Planned mitigation: definition inlined; link target preserved

```markdown
See [the docs](https://example.com).

```

### hard line break

Planned mitigation: two-space break becomes backslash; renders identically

```markdown
line one\
line two

```

### literal asterisk (unescaped)

Planned mitigation: serializer adds protective escapes

```markdown
A literal \* asterisk and \_ underscore.

```

### html entity

Planned mitigation: entities decoded to literal characters; renders identically

```markdown
Café & bar

```

### setext heading

Planned mitigation: normalizes to ATX

```markdown
# Title

## Sub

```

### yaml front matter

Planned mitigation: Phase 3 custom node

```markdown
---

title: Test
tags: \[a, b]
-------------

Body text.

```

### block math

Planned mitigation: needs remark-math, which only the shipping config has

```markdown
$$
\int\_0^1 x^2 dx
$$

```

### github alert

Planned mitigation: Phase 3 custom node

```markdown
> \[!NOTE]
> Useful information.

```

### toc directive

Planned mitigation: Phase 3 custom node

```markdown
\[TOC]

# Heading

```

### indented code block

Planned mitigation: often normalized to fences

```markdown
Text:

```
indented code
second line
```

```
