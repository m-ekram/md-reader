# What's New

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
greyed deliberately: block math and reference links are read correctly but are
not modelled separately, so a command to create one would be undone by the next
save. The **Markdown Reference** lists them.

### Try these first

- `Ctrl+Shift+P` — every command, searchable by name
- `Ctrl+/` — the raw markdown, and back again
- `F8` — dim everything but the paragraph you are writing
