# Changelog

All notable changes to ekram.md are listed here. Versions follow
[Semantic Versioning](https://semver.org/). The full, detailed list is in the
app under **Help ▸ Change Log**.

## [1.0.0] — 2026-10-01

The first public release.

### Writing

- WYSIWYG markdown on one editing surface: headings, lists, tables, task lists,
  code blocks, math, mermaid diagrams, GitHub alerts, footnotes, front matter
  and `[TOC]` render as you type.
- Source mode (`Ctrl+/`) for the raw markdown, with find and replace in both
  views, regular expressions included.
- Focus mode, typewriter mode, smart punctuation, spell checking in the
  language you choose, and a command palette (`Ctrl+Shift+P`).
- `[[Wiki links]]` between the notes in a folder: `Ctrl`+click to follow one,
  and suggestions as you type `[[`.

### Files and folders

- Open a folder for its file tree, outline, article list and full-text search,
  with replace across the folder after a preview.
- Create, rename, move and delete files from the sidebar; tabs keep their undo
  history.
- Files are written byte for byte as they came: encoding, BOM and line endings
  are kept, and a file that could not be written back faithfully is flagged
  when it opens.
- Unsaved work is journalled as you type and offered back after a crash; the
  last twenty versions of every file are kept and can be restored.
- Optional automatic saving, never over another program's change.

### Look and output

- Ten themes, plus your own; text size, column width, fonts and line height of
  your choosing.
- Export to self-contained HTML and to PDF with page setup, and print through
  the Windows print dialog.

### Release

- Installer for Windows with Start Menu shortcut, uninstaller and `.md` /
  `.markdown` file association, and a portable zip.
- Updates from GitHub Releases: checked after start-up, downloaded only when you
  agree, installed when you choose.

## [0.1.0]

The first, private version.
