# More Topics

## Keyboard

Every menu item shows its shortcut. `Ctrl+Shift+P` opens the command palette,
which searches all of them by name — including the ones with no shortcut at all,
every theme, and your recent files.

`Ctrl+Tab` cycles through open documents. `Ctrl+P` opens a file in the current
folder by name.

`Alt` and a menu's underlined letter opens it: **F**ile, **E**dit, **P**aragraph,
F**o**rmat, **V**iew, **T**hemes, **H**elp. In the file tree and the tab strip the
arrow keys move between items; `Delete` closes the tab you are on.

## Keyboard shortcuts

| Menu | Command | Shortcut |
| --- | --- | --- |
| File | New | `Ctrl+N` |
| File | New Window | `Ctrl+Shift+N` |
| File | Open | `Ctrl+O` |
| File | Open Quickly | `Ctrl+P` |
| File | Save | `Ctrl+S` |
| File | Save As | `Ctrl+Shift+S` |
| File | Print | `Alt+Shift+P` |
| File | Preferences | `Ctrl+,` |
| File | Close | `Ctrl+W` |
| Edit | Undo | `Ctrl+Z` |
| Edit | Redo | `Ctrl+Y` |
| Edit | Cut | `Ctrl+X` |
| Edit | Copy | `Ctrl+C` |
| Edit | Paste | `Ctrl+V` |
| Edit | Copy as Markdown | `Ctrl+Shift+C` |
| Edit | Paste as Plain Text | `Ctrl+Shift+V` |
| Edit | Select All | `Ctrl+A` |
| Edit | Move Row Up | `Alt+Up` |
| Edit | Move Row Down | `Alt+Down` |
| Edit | Find | `Ctrl+F` |
| Edit | Find Next | `F3` |
| Edit | Find Previous | `Shift+F3` |
| Edit | Replace | `Ctrl+H` |
| Paragraph | Heading 1 | `Ctrl+1` |
| Paragraph | Heading 2 | `Ctrl+2` |
| Paragraph | Heading 3 | `Ctrl+3` |
| Paragraph | Heading 4 | `Ctrl+4` |
| Paragraph | Heading 5 | `Ctrl+5` |
| Paragraph | Heading 6 | `Ctrl+6` |
| Paragraph | Paragraph | `Ctrl+0` |
| Paragraph | Increase Heading Level | `Ctrl+=` |
| Paragraph | Decrease Heading Level | `Ctrl+-` |
| Paragraph | Math Block | `Ctrl+Shift+M` |
| Paragraph | Code Fences | `Ctrl+Shift+K` |
| Paragraph | Quote | `Ctrl+Shift+Q` |
| Paragraph | Ordered List | `Ctrl+Shift+[` |
| Paragraph | Unordered List | `Ctrl+Shift+]` |
| Paragraph | Task List | `Ctrl+Shift+X` |
| Paragraph | Indent | `Tab` |
| Paragraph | Outdent | `Shift+Tab` |
| Format | Strong | `Ctrl+B` |
| Format | Emphasis | `Ctrl+I` |
| Format | Underline | `Ctrl+U` |
| Format | Code | `` Ctrl+Shift+` `` |
| Format | Strike | `Alt+Shift+5` |
| Format | Hyperlink | `Ctrl+K` |
| Format | Clear Format | `Ctrl+\` |
| View | Toggle Sidebar | `Ctrl+Shift+L` |
| View | Outline | `Ctrl+Shift+1` |
| View | Articles | `Ctrl+Shift+2` |
| View | File Tree | `Ctrl+Shift+3` |
| View | Search | `Ctrl+Shift+F` |
| View | Source Code Mode | `Ctrl+/` |
| View | Focus Mode | `F8` |
| View | Typewriter Mode | `F9` |
| View | Toggle Fullscreen | `F11` |
| View | Actual Size | `Ctrl+Shift+9` |
| View | Zoom In | `Ctrl+Shift+=` |
| View | Zoom Out | `Ctrl+Shift+-` |
| View | Switch Between Opened Documents | `Ctrl+Tab` |
| View | Toggle DevTools | `Shift+F12` |
| — | Command Palette | `Ctrl+Shift+P` |
| — | Previous Document | `Ctrl+Shift+Tab` |

## Working in a folder

The Outline marks the heading you are in, and a click on a heading goes to it in
either view. A folder search result opens its file at that match, with the word
in the find bar; **Aa** beside the search box matches case. The file tree
follows files and folders as they are made or deleted. The **×** beside the
folder's name, or **Close Folder** in the command palette, closes it.

The folder search can match case, whole words or a regular expression, like the
find bar. **Replace…** below it replaces across the folder, after showing each
file it would change; untick any to leave it alone. Every file is kept in Data
Recovery before it changes, and a file changed since the preview is left alone.

Right-click in the file tree to make a file or folder, rename one, or move it to
the Recycle Bin; right-click the space below the files to make one at the top.
Only files inside the open folder can be changed from here. Right-click a tab
for ways to close several at once, and drag a tab to move it.

## Large documents

Past about five thousand lines the formatted view starts to feel heavy, and the
status bar says so; click the warning, or press `Ctrl+/`, to switch to source
mode, which stays responsive because it only renders the part of the file you
are looking at. Both views edit the same text, so switching costs nothing.

Past about ten thousand lines a document opens in source mode by itself, and a
message says so, with **Show Formatted** if you want the formatted view anyway.

The two thresholds are in `File ▸ Preferences… ▸ Large documents`.

## When a file changes underneath you

If a file is modified by something else while it is open, an unedited document
reloads silently and an edited one asks first. If it is deleted, the tab stays
open and says so rather than closing and taking your work with it. If it is
renamed, the tab follows it.

## Files that cannot round-trip

Opening a file parses it; saving writes it back out. A construct this editor
does not model would be normalized on the way out, so every file is checked when
it opens and the status bar warns before you type anything. Source mode edits
the text directly and is the safe way to touch such a file.

## Whitespace and line endings

`Edit ▸ Whitespace and Line Breaks` shows markers for spaces, tabs and line
breaks, and strips trailing spaces from the document.

Line endings are shown in the status bar and set per document under
`Edit ▸ Line Endings`. A file keeps the endings it arrived with unless you
change them.

## Recovering work

Each time a file is saved, the version it replaces is kept: up to twenty for
each file, and never more than 10 MB of them. **Help ▸ Data Recovery and
Version Control** lists them, newest first, and shows the one you pick against
the text now, with lines taken out and put in marked. **Restore this version**
puts it in the editor without saving, so nothing on disk changes until you
save. A file's versions follow it when it is renamed or moved.

Unsaved work is kept separately, as you type, and offered back if the app stops
unexpectedly.

## PDFs and printing

**Export PDF** asks for the paper, orientation, margins and whether to number
the pages, starting from your last choice. **Print** opens the Windows print
dialog, starting from the same setup.
