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

### Everyday comforts

- The documents you had open come back when you start the app again, with the
  same one in front. Turn it off in **Preferences ▸ Files**.
- With nothing to reopen, a welcome screen offers a new document (press
  `Enter`), Open, Open Folder and your recent files, instead of a blank page.
- **Save automatically**, in **Preferences ▸ Files**, saves a document that
  already has a file a moment after you stop typing, and when you switch away.
  It is off unless you turn it on, and it never saves over a change another
  program made.
- Right-click for spelling suggestions, **Add to Dictionary**, cut, copy and
  paste, and for opening or copying a link.
- Drop a markdown file onto the window to open it.
- **Match Windows light or dark mode**, in **Preferences ▸ Appearance**, picks
  a light theme and a dark theme and switches as Windows does.
- On Windows 11, hover over the maximize button for Snap Layouts.

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
- In a long document, Find shows you the match it moves to.
- `Ctrl+Z` undoes one burst of typing at a time, even if Windows corrects the
  clock in between. It could take back two at once.
- Pressing `Escape` on "Unsaved changes were recovered" keeps them for next
  time. It used to throw them away. Several recovered documents are offered in
  one question, with **Restore All**.
- The folder you had open is open again when you start the app.
- Commands only ever change the document in front of you. In source view,
  `Ctrl+B` could change another tab.
- Help pages stay as they are: no command, shortcut or paste changes them.
- Changing the line endings counts as an edit, so closing asks before losing it.
- **File ▸ Delete** keeps any unsaved changes open, rather than closing them
  with the file.
- When a file cannot be opened, you are told which one and why.
- Find and replace work in source view, and find's matches are highlighted in
  the formatted view (they were marked but not shown). `Enter` steps through
  them without leaving the find box.
- Export and print work from source view, and code blocks far down a long
  document are exported with their code.
- `[[Wiki links]]` are saved exactly as you wrote them.

### Commands that now do what they say

- **Move Row Up / Down** (`Alt+↑` / `Alt+↓`) move the table row you are in.
- **Delete Row** and **Delete Column** delete the one you are in.
- `Ctrl+=` and `Ctrl+-` change a heading one level at a time, from anywhere in
  it, and turn a paragraph into a heading and back.
- `Ctrl+K` asks for the link's address.
- **Math Block** (`Ctrl+Shift+M`) is available, in the menus and the toolbar.
- **Copy as…** copies the selection. **Copy without Theme Styling** pastes into
  mail or a word processor as formatted text.
- Renaming an open file in Explorer moves its tab to the new name, instead of
  sometimes marking it as deleted.
- A pasted image shows straight away. It showed as broken until the file was
  opened again.

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
