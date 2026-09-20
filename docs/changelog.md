# Change Log

## 0.1.0

The first release.

### Editing

A single formatted surface rather than a split preview: headings, lists, tables,
quotes, code fences, math, diagrams and GitHub alerts all render as you type.
Source mode on `Ctrl+/` shows the raw markdown for the whole document.

Find and replace, focus and typewriter modes, readonly mode, word count, smart
punctuation, visible whitespace, spell check, and a command palette that
searches every command by name.

### Files and folders

Open a folder and work from the sidebar: Outline, Articles, File Tree and a
folder-wide search that streams results as it finds them. Tabs keep their undo
history when you switch between them.

Files are watched for external changes. A modified file reloads when you have
not edited it and asks when you have; a deleted file leaves its tab open rather
than closing it; a renamed file is followed.

### Not losing work

Saves are atomic and preserve the file's original encoding, byte order mark and
line endings. Every save keeps the previous version, reachable from
`Help ▸ Data Recovery and Version Control`. Unsaved work is journalled as you
type and offered back after a crash.

Every file is checked when it opens: if it contains something this editor cannot
write back faithfully, the status bar says so before you type.

### Themes and export

Six built-in themes, and user themes picked up from the config folder without a
restart. HTML export inlines its styles and embeds its images so the file works
anywhere; PDF export renders from the same HTML, so the two agree.
