# ekram.md

A fast WYSIWYG markdown editor for Windows. Electron + Milkdown/Crepe.

Plan: `C:\Users\ekram\.claude\plans\i-want-to-build-sharded-stallman.md`

---

# Phase 0 findings

The spike exists to test the plan's two load-bearing assumptions before anything is
built on them. Measured on this machine, 2026-09-19, against Crepe 7.22.1 /
Electron 44.4.3.

## Q1 — Does the inline WYSIWYG hold up?

**Partly. Needs a human judgement call — run `npm run spike:app` and type in it.**

What the measurements already establish:

| capability | Crepe out of the box |
| --- | --- |
| Live heading/list/emphasis transforms | yes |
| Tables, task lists, footnotes | yes |
| Inline and block math (KaTeX) | yes |
| Fenced code with language picker | yes |
| Mermaid diagrams | no — custom node needed (Phase 3) |
| GitHub alerts `> [!NOTE]` | no — parsed as a quote, brackets escaped (Phase 3) |
| YAML front matter | no — actively mangled, see Q2 |

## Q2 — Does it round-trip? **This is the important one.**

`npm run spike:roundtrip` measures parse -> serialize over 43 construct fixtures.

| configuration | lossless |
| --- | --- |
| commonmark + gfm, Milkdown defaults | 24/43 |
| commonmark + gfm, tuned serializer | 30/43 |
| **Crepe (shipping config), tuned serializer** | **31/43** |

Two findings that change the plan:

### 1. Serializer tuning is cheap and worth ~6 constructs

Setting `bullet: '-'`, `rule: '-'`, `listItemIndent: 'one'` and friends via
`remarkStringifyOptionsCtx` closes six failures outright (lists, nesting, task lists,
thematic breaks). **It must be configured before `create()`** — Milkdown builds its
remark instance at init, so configuring afterwards silently does nothing. This moves
from Phase 6 to Phase 1: it is a handful of options, and it stops every save from
reformatting untouched parts of the file.

### 2. Crepe's `image-block` feature destroys image alt text

Not anticipated by the plan, and the most damaging thing found:

```
![alt text](./img/pic.png)   ->   ![1.00](./img/pic.png)
![](./img/pic.png)           ->   ![1.00](./img/pic.png)
![a](p.png "Title")          ->   ![1.00](p.png "Title")
Inline ![alt here](p.png)    ->   Inline ![alt here](p.png)     (inline is safe)
```

The feature writes the image's **width ratio into the alt slot**. Every block-level
image in every note loses its alt text on first save — a content and accessibility
loss, silent, and irreversible without a backup. Disabling `ImageBlock` preserves alt
text perfectly, so the fix is to keep the feature and override the image node's
markdown serializer to round-trip the real alt and keep the ratio elsewhere.

### Still lossy after tuning

| construct | severity | plan |
| --- | --- | --- |
| YAML front matter | **destroys the document** — becomes `***` + paragraph + setext heading | Phase 3 node, but see below |
| image alt text (block images) | **silent content loss** | Phase 3, serializer override |
| GitHub alerts | broken — `> \[!NOTE]` | Phase 3 node |
| `[TOC]` | broken — `\[TOC]` | Phase 3 node |
| reference links | inlined, definitions dropped | acceptable; content and links survive |
| tables | `| --- |` -> `| - |`, padding changes | cosmetic |
| hard line break | two-space -> `\` | cosmetic, renders identically |
| setext heading | -> ATX | cosmetic |
| indented code | -> fenced | cosmetic |
| html entities | `&amp;` -> `&` | cosmetic, renders identically |
| bare `*` / `_` | serializer adds protective escapes | cosmetic, safer output; genuinely escaped characters round-trip cleanly |

**Front matter must move from Phase 3 to Phase 1.** It is ubiquitous in real notes
(Obsidian, Hugo, Jekyll) and the current behavior is not "lossy", it is destructive:
the document is restructured into garbage. Shipping a Phase 1 that can open and save a
file must not mean shipping something that eats front matter.

The round-trip guard is therefore not optional polish — it is the thing standing
between the user and silent data loss, and it must be in place before the first save
path ships.

## Q3 — How large a file before it hurts?

`npm run spike:app` with `PHASE0_AUTO=1`. Typing latency measured over 40 keystrokes.

| lines | mount | typing median | typing p95 | typing max |
| ---: | ---: | ---: | ---: | ---: |
| 500 | 241 ms | 17.5 ms | 491 ms | 3325 ms |
| 1 000 | 345 ms | 17.4 ms | 22 ms | 124 ms |
| 2 000 | 938 ms | 17.5 ms | 337 ms | 518 ms |
| 5 000 | 1 535 ms | 24.4 ms | 110 ms | 1 818 ms |
| 8 000 | 2 319 ms | 36.6 ms | 483 ms | 3 842 ms |
| 12 000 | 3 712 ms | 54.8 ms | 481 ms | 9 056 ms |
| 20 000 | 6 618 ms | 95.9 ms | 472 ms | 37 885 ms |

Mount cost is roughly 0.3 ms per line and dominates the experience before typing
latency does. Typing crosses the perceptible threshold (~30 ms median) around 6–8k lines.

**Thresholds for the source-mode fallback:** offer source mode above **5 000 lines**,
default to it above **10 000**. A 20k-line file takes 6.6 s to open and 96 ms per
keystroke — unusable as WYSIWYG.

## Q4 — What does it cost?

| metric | measured | plan target | verdict |
| --- | --- | --- | --- |
| cold start (to window shown) | **687 ms** | < 1 500 ms | pass |
| idle RSS, 4 processes, small doc | **331 MB** | < 350 MB | pass, with no headroom |
| renderer bundle, total | 6.2 MB | — | 118 chunks |
| renderer bundle, eager entry | 3.0 MB | — | worth splitting |

Caveat worth recording: an earlier run reported 5 051 ms cold start and 608 MB idle.
Both were artifacts of the perf suite running concurrently with startup. The numbers
above are from a clean run doing nothing but mounting a small document.

The 3.0 MB eager chunk is the obvious cold-start lever. `@codemirror/language-data`
pulls ~110 language modes; they are already split into lazy chunks, but the entry is
still large enough to be worth attention if cold start regresses.

## Verdict

Both load-bearing assumptions **hold, with conditions**:

1. Crepe is close enough that the remaining gap is custom nodes and styling,
   not a different architecture. Proceed.
2. Round-tripping is good enough *provided* front matter and image alt text are fixed
   before any save path ships, and the round-trip guard is in place.

Nothing here justifies abandoning the approach. Two items move earlier: serializer
tuning and YAML front matter, both into Phase 1.
