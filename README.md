# ekram.md

A fast, native-feeling WYSIWYG markdown editor for Windows.

Markdown renders as you type on a single editing surface — no split source/preview pane.
Headings, lists, tables, math and code blocks transform live, and the raw syntax stays
hidden except in the block your cursor is in.

Built on Electron and Milkdown/Crepe (ProseMirror).

## Status

**Phases 0–6 complete, plus a hardening pass.** All six phases are done.

- **Shell** — frameless window with a themed title bar, the full seven-menu menu
  bar driven by one command registry, multi-window, crash recovery.
- **Files** — open, edit and save with byte-exact preservation of encoding, BOM and
  line endings; a round-trip guard that warns before you edit a file that cannot be
  written back faithfully; Data Recovery restores the version kept before the last save.
- **Workspace** — open a folder, with Outline, Articles, File Tree and folder-wide
  Search panels, tabs that keep their undo history, file watching that follows
  renames, and Open Quickly.
- **Content** — YAML front matter, GitHub alerts, `[TOC]`, math, mermaid diagrams
  (loaded on first use), and image paste into a local assets folder.
- **Editing** — find and replace, source mode, focus and typewriter modes, readonly,
  zoom, word count, smart punctuation, visible whitespace, and a command palette
  on Ctrl+Shift+P that searches every implemented command.
- **Export** — self-contained HTML with inlined styles and embedded images, PDF
  through Chromium's own printing, and print through the same path. Both are
  styled by the theme file the application itself loads, so an export matches
  the screen.
- **Themes and preferences** — six built-in themes covering both polarities, user
  themes picked up from the config folder without a restart, and a preferences
  dialog on Ctrl+, whose every control applies as you change it.
- **Help** — the Help topics are markdown files opened in the editor itself, so the
  documentation is rendered by the code it documents.
- **Packaging** — builds an NSIS installer, associates `.md` and `.markdown`, and
  handles files passed on the command line.

Measured with `npm run bench` (median of five launches): **645 ms cold start,
328 MB idle**, both inside the Phase 0 budgets of 1.5 s and 350 MB.

Cold start on this machine swings with its load — the same build has measured
anywhere from about 600 ms to over 1 s on different days — so only
comparisons taken in the same session mean anything. The figures above were
taken alongside a baseline from before the second hardening round (694 ms,
327 MB), which is how that round is known to have cost nothing.

524 tests pass (392 unit, 132 end-to-end), and the end-to-end suite has run
three times in a row without a failure. `npm run verify` runs typecheck, lint
and both suites in one command.

### Second hardening round

An audit before any new features found problems that could lose or misplace
work without a word, and testing the fixes against what the user would see
turned up worse ones. All are fixed, each with a test checked by putting the
bug back:

- **Opening a file edited it**, if the file ended in a list, code block, table
  or quote: the editor's trailing empty paragraph serialized as an extra
  newline, so the file prompted to save on close and a save rewrote it.
- **Saving or closing straight after typing** acted on text without the last
  keystrokes, because the editor reports changes on a debounce.
- **The tab's close button discarded unsaved work** without asking.
- **A save failed silently** on a read-only or locked file, and failed outright
  whenever another program was reading the file; saves now retry briefly and
  every failure is reported in plain words.
- **A file merely touched by another program** raised a "reload and lose your
  edits?" prompt whose default button did exactly that.
- **A renderer crash left a blank window**; it now reloads and offers the
  unsaved work back.
- A theme id could read files outside the themes folder, exports could carry
  local paths, and `npm audit` reported five highs; all closed.

The packaged build is verified by hand rather than by the suite: Windows
Application Control blocks programmatic launch of the unsigned executable, so
the end-to-end tests run against `out/` and the installed app is checked
manually. Confirmed there: the app launches, and Help topics load from
`resources/docs` — the one path that differs once packaged, since in
development the same files are read from the repository folder. Signing the
build would let the suite cover it too.

Menu coverage is **135 of 140 items, with the other 5 deliberately unavailable**
and no item left merely unimplemented. Run `node scripts/menu-coverage.cjs --list`
for the count. The five are refusals rather than gaps: block math and reference
links are read correctly but are not modelled separately, so a command to create
either would be undone by the next save, and Import needs Pandoc this build does
not bundle. Each says so in its tooltip rather than reading as unfinished.

## Development

```powershell
npm install
npm run dev              # run the app with hot reload
npm run verify           # typecheck + lint + unit + e2e, in one command
npm run bench            # cold start and memory, median of five launches
npm run build:win        # NSIS installer into dist/
npm test                 # unit tests only
npm run test:e2e         # end-to-end tests against the real app
npm run lint             # eslint
npm run format           # prettier
npm run spike:roundtrip  # markdown fidelity corpus
```

---

# Phase 0 findings

The spike exists to test two load-bearing assumptions before the application is built on
them: that the editing engine can deliver a true inline-WYSIWYG experience, and that it
can do so without corrupting the user's markdown. Measured 2026-09-19 against
Crepe 7.22.1 / Electron 44.4.3.

## Q1 — Does the inline WYSIWYG hold up?

**Largely yes. The remaining gap is custom nodes and styling, not architecture.**

| capability                                | available out of the box                 |
| ----------------------------------------- | ---------------------------------------- |
| Live heading / list / emphasis transforms | yes                                      |
| Tables, task lists, footnotes             | yes                                      |
| Inline and block math (KaTeX)             | yes                                      |
| Fenced code with language picker          | yes                                      |
| Mermaid diagrams                          | no — custom node required                |
| Callouts `> [!NOTE]`                      | no — parsed as a quote, brackets escaped |
| YAML front matter                         | no — actively mangled, see Q2            |

## Q2 — Does markdown survive a round-trip? **The important one.**

A WYSIWYG editor never writes the original bytes back: it parses to a document model and
re-serializes. Anything the model does not represent is lost the moment the file is saved.
`npm run spike:roundtrip` measures parse -> serialize across 43 construct fixtures.

| configuration                                | lossless  |
| -------------------------------------------- | --------- |
| commonmark + gfm, library defaults           | 24/43     |
| commonmark + gfm, tuned serializer           | 30/43     |
| **shipping configuration, tuned serializer** | **31/43** |

Two findings that changed the build order:

### 1. Serializer tuning is cheap and worth six constructs

Setting `bullet: '-'`, `rule: '-'`, `listItemIndent: 'one'` and related options via
`remarkStringifyOptionsCtx` closes six failures outright — lists, nesting, task lists and
thematic breaks. **It must be configured before `create()`**: the remark instance is built
at init, so configuring afterwards silently does nothing. This moved into Phase 1, because
it stops every save from reformatting untouched parts of a file.

### 2. The `image-block` feature destroys image alt text

The most damaging thing found, and not anticipated:

```
![alt text](./img/pic.png)   ->   ![1.00](./img/pic.png)
![](./img/pic.png)           ->   ![1.00](./img/pic.png)
![a](p.png "Title")          ->   ![1.00](p.png "Title")
Inline ![alt here](p.png)    ->   Inline ![alt here](p.png)     (inline is safe)
```

The feature writes the image's **width ratio into the alt slot**. Every block-level image
loses its alt text on first save — a silent content and accessibility loss. Block images
only; disabling the feature preserves alt text perfectly. The fix is to keep the widget and
override the image node's markdown serializer so the real alt round-trips and the ratio
lives elsewhere. Until then the feature stays disabled.

### Still lossy after tuning

| construct                     | severity                                                               | disposition                                               |
| ----------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------- |
| YAML front matter             | **destroys the document** — becomes `***` + paragraph + setext heading | custom node, Phase 1                                      |
| image alt text (block images) | **silent content loss**                                                | serializer override                                       |
| callouts                      | broken — `> \[!NOTE]`                                                  | custom node                                               |
| `[TOC]`                       | broken — `\[TOC]`                                                      | custom node                                               |
| reference links               | inlined, definitions dropped                                           | acceptable; content and links survive                     |
| tables                        | delimiter row and padding normalized                                   | cosmetic                                                  |
| hard line break               | two-space becomes `\`                                                  | cosmetic, renders identically                             |
| setext heading                | becomes ATX                                                            | cosmetic                                                  |
| indented code                 | becomes fenced                                                         | cosmetic                                                  |
| html entities                 | decoded to literal characters                                          | cosmetic, renders identically                             |
| bare `*` / `_`                | protective escapes added                                               | cosmetic; genuinely escaped characters round-trip cleanly |

**Front matter moved from Phase 3 to Phase 1.** It is ubiquitous in real notes (Obsidian,
Hugo, Jekyll) and the current behaviour is not merely lossy but destructive — the document
is restructured into garbage. No save path can ship before it is handled.

The round-trip guard — parse, re-serialize and diff on open, warning the user _before_ they
edit a file that cannot be represented losslessly — is therefore not polish. It is the
thing standing between the user and silent data loss.

## Q3 — How large a file before it hurts?

Typing latency measured over 40 keystrokes per document size.

|  lines |    mount | typing median | typing p95 | typing max |
| -----: | -------: | ------------: | ---------: | ---------: |
|    500 |   241 ms |       17.5 ms |     491 ms |   3 325 ms |
|  1 000 |   345 ms |       17.4 ms |      22 ms |     124 ms |
|  2 000 |   938 ms |       17.5 ms |     337 ms |     518 ms |
|  5 000 | 1 535 ms |       24.4 ms |     110 ms |   1 818 ms |
|  8 000 | 2 319 ms |       36.6 ms |     483 ms |   3 842 ms |
| 12 000 | 3 712 ms |       54.8 ms |     481 ms |   9 056 ms |
| 20 000 | 6 618 ms |       95.9 ms |     472 ms |  37 885 ms |

Mount cost is roughly 0.3 ms per line and dominates the experience before typing latency
does. Typing crosses the perceptible threshold (~30 ms median) around 6–8k lines.

**Source-mode fallback:** offer it above **5 000 lines**, default to it above **10 000**.
A 20k-line file takes 6.6 s to open and 96 ms per keystroke — unusable as WYSIWYG.

## Q4 — What does it cost?

| metric                           | measured   | target     | verdict           |
| -------------------------------- | ---------- | ---------- | ----------------- |
| cold start (to window shown)     | **687 ms** | < 1 500 ms | pass              |
| idle RSS, 4 processes, small doc | **331 MB** | < 350 MB   | pass, no headroom |
| renderer bundle, total           | 6.2 MB     | —          | 118 chunks        |
| renderer bundle, eager entry     | 3.0 MB     | —          | worth splitting   |

Worth recording: an earlier run reported 5 051 ms cold start and 608 MB idle. Both were
artifacts of the perf suite running concurrently with startup. The numbers above are from a
clean run mounting only a small document.

The 3.0 MB eager chunk is the obvious cold-start lever. `@codemirror/language-data` pulls
~110 language modes; they are already split into lazy chunks, but the entry is large enough
to watch if cold start regresses.

## Verdict

Both assumptions hold, with conditions. The editing engine is close enough that the
remaining work is custom nodes and styling rather than a different architecture, and
round-tripping is good enough **provided** front matter and image alt text are fixed before
any save path ships, and the round-trip guard is in place.
