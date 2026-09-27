# What's New

## Since 0.1.0

### Make the page yours

Set the text size from the status bar (**A−** and **A+**), with **View ▸ Zoom**,
or with `Ctrl` and the mouse wheel. The title and tab bars keep their size.
Choose how wide the text runs in **Preferences**, up to the full window. Both
are remembered, whichever theme you use.

Four new themes: **Nord** and **One Dark**, and **Sepia** and **Gruvbox Dark**
for long reading sessions. Code blocks now take their colours from the theme.

**View ▸ Toolbar** shows a formatting toolbar; every button says what it does
when you hover over it.

### Safer with your work

- Double-clicking a document opens it, every time. It could open an empty
  window instead.
- A window no longer closes while it is still asking whether to save.
- **File ▸ Reload from Disk** shows the file as it is on disk.
- Work you chose not to save is not offered back as a "recovery" later, and a
  second window never offers the first window's unsaved work.
- A file another program put back with an older date is noticed before you save
  over it.
- An export only ever includes real images, never other files a document points
  at.
- When something goes wrong, you are told.

## 0.1.0 — the first release

Everything is new. The **Change Log** has the full list; these are the parts
worth knowing about on the first run.

### Your files are only written when you ask

There is no autosave. Opening a document and closing it again never modifies it.
Unsaved work is still protected: it is journalled as you type and offered back
if the application stops unexpectedly.

### You are told before a file can be damaged, not after

An editor that shows formatted text has to parse your file and write it back
out, and anything it does not understand could be lost in between. Every file is
checked the moment it opens, and the status bar warns you before you have typed
a character. Source mode edits the text directly if you would rather not risk
it.

### The menu says what it can do

An item that is greyed out is one this version does not implement, and a few are
greyed deliberately: block math and reference links are read correctly, but
there is no command to create them. The **Markdown Reference** lists them.

### Try these first

- `Ctrl+Shift+P` — every command, searchable by name
- `Ctrl+/` — the raw markdown, and back again
- `F8` — dim everything but the paragraph you are writing
