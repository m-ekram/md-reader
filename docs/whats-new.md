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
- Unsaved work found after a crash is never thrown away because a clock or a
  file's date is off.
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

### Easier to read, in every theme

- The sidebar shows where the pointer is in the light themes, and its
  secondary text (folders, line numbers) is no longer faint.
- Dark themes have dark scrollbars, drop-down lists and checkboxes.
- Menu shortcuts, tab names, the window title, the status bar and alert labels
  are all readable against their background, in every theme.
- Menus, tabs and the status bar keep their own font in the serif themes.
- A window opens in its theme's colours, instead of flashing dark first.

### Tidier layout

- Menus stay inside the window, and scroll when it is short.
- The find bar sits below the tabs instead of over them.
- The text column is centred, and exactly as wide as you set it.
- A new document says "Start writing, or type / for blocks"; other empty lines
  stay clean.
- With many tabs open, the one you are on stays in view. `Ctrl+Shift+Tab` goes
  back through them.
- Two files with the same name get tabs that tell them apart.

### Easier to find your way

- Messages appear at the bottom right, above the status bar. Several can show
  at once, and one stays while you point at it, so a second message no longer
  replaces the first before you have read it.
- After **Export HTML** or **Export PDF**, the message has **Open** and **Show
  in Folder**.
- `Ctrl+S` says "Saved" for a moment. Saving automatically stays quiet.
- Saving a new document suggests a name from its first heading, in the folder
  you have open.
- An image pasted into a document you have not saved yet is kept: choose
  **Save As…** in the message, and it is added once the document has a folder.
- The welcome screen points to the command palette, the `/` menu and the Quick
  Start guide.
- The sidebar stays hidden until you open a folder, then shows its files. Its
  panels offer **Open Folder…** when none is open.
- The command palette (`Ctrl+Shift+P`) finds themes and recent files by name.
- Secondary text such as quotes and captions is easier to read in Whitey, One
  Dark, Nord, Pixyll and Sepia.
- A setting changed in Preferences sticks. Changed while something else was
  being saved, it could go back to what it was.

### Long documents and folders

- A long document that opens in source view says why, with **Show Formatted**.
  In the formatted view, the status bar's "may lag" warning switches to source
  view when you click it; in source view it no longer shows.
- The Outline marks the heading you are in, and clicking a heading works in
  source view too.
- A folder search result opens its file at that match, selected and with the
  word in the find bar. **Aa** beside the search box matches case.
- The file tree shows files and folders made or deleted while the folder is
  open, and keeps open folders open.
- **Close Folder**, beside the folder's name and in the command palette.

### Versions, PDFs and printing

- Every file keeps its last twenty versions, one from before each save.
  **Help ▸ Data Recovery** lists them, shows the one you pick against the text
  now, and puts it back in the editor, unsaved. Versions follow a file when it
  is renamed or moved.
- **Export PDF** asks for paper, orientation, margins and page numbers first,
  and remembers your choice.
- **Print** opens the Windows print dialog, starting from the same page
  setup, instead of opening a PDF in another program.

### Linked notes

- `[[Wiki links]]` show as links. `Ctrl`+click one to open the note it names,
  at the heading after `#` if it gives one; a note that is not there yet is
  offered to be made.
- Type `[[` and the open folder's notes are listed as you type; `Enter` puts
  the name in and closes the link.

### Find and replace, further

- **.\*** in the find bar searches by regular expression, in either view; a
  replacement can use `$1` for the first group. A pattern that is not one says
  **Invalid pattern**.
- The folder search has **Whole word** and **.\*** beside **Aa**, and finds
  text in files saved as UTF-16.
- **Replace…** in the Search panel replaces across the whole folder: it first
  shows every file it would change, with a few lines before and after, and you
  can leave any file out. Each file is kept in Data Recovery before it changes,
  and open documents change in their tabs, unsaved.

### Files from the sidebar

- Right-click in the file tree for **New File**, **New Folder**, **Rename** and
  **Delete**. A new name is typed where the item will appear; a new file opens
  ready to type in.
- Renaming a file or folder takes its open documents along, unsaved work
  included. Nothing is ever written over a file that is already there.
- **Delete** moves to the Recycle Bin, after asking. An open document with
  unsaved work stays open, so nothing typed is lost.
- Right-click a tab to close it, the others, those to its right or the saved
  ones, or to copy its path, find it in the sidebar or show it in its folder.
- Drag a tab to move it.

### The keyboard, all the way

- Closing the command palette, Open Quickly or Preferences puts you back where
  you were typing. `Tab` stays inside a dialog while it is open.
- A file opened from the file tree, Open Quickly or **File ▸ Open** is ready to
  type in.
- `Alt` and a letter opens a menu (`Alt+F` for File), with the letters
  underlined while `Alt` is held.
- The arrow keys move through the file tree, opening and closing folders, and
  through the tabs; `Delete` closes the tab you are on.
- Screen readers hear which menu items are toggles and which are choices, and
  which result is highlighted in the command palette and Open Quickly.
- **Help ▸ More Topics** lists every keyboard shortcut.

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
