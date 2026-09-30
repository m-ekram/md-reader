# More Topics

## Keyboard

Every menu item shows its shortcut. `Ctrl+Shift+P` opens the command palette,
which searches all of them by name — including the ones with no shortcut at all,
every theme, and your recent files.

`Ctrl+Tab` cycles through open documents. `Ctrl+P` opens a file in the current
folder by name.

## Working in a folder

The Outline marks the heading you are in, and a click on a heading goes to it in
either view. A folder search result opens its file at that match, with the word
in the find bar; **Aa** beside the search box matches case. The file tree
follows files and folders as they are made or deleted. The **×** beside the
folder's name, or **Close Folder** in the command palette, closes it.

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

See **Data Recovery and Version Control** in the Help menu.
