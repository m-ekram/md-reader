# Change Log

## Since 0.1.0

### Appearance

- Text size, from the status bar, View ▸ Zoom or `Ctrl`+wheel; the chrome keeps
  its size. Column width up to the full window. Both persist.
- Themes: Nord, One Dark, Sepia and Gruvbox Dark. Code blocks follow the theme;
  dark themes get dark diagrams and a dark source view.
- A slimmer title bar and tab bar; tabs are capped in width, with the full path
  in their tooltip.
- The block menu has a readable background; the drag handle says what it does.
- View ▸ Toolbar shows a formatting toolbar, with a label on every button.
- The app has its logo: on the window, the taskbar, the installer and About.

### Everyday

- The last session's saved files reopen at launch, with the same one in front;
  missing files are skipped with a notice. Preferences ▸ Files turns it off.
- A welcome screen replaces the blank Untitled document at launch and after the
  last tab closes: New, Open, Open Folder and up to eight recent files.
- Save automatically (off by default): files with a path are saved a second
  after typing stops, on switching away, and before the window closes. It
  refuses to overwrite a file another program changed and says so; Untitled
  documents and files the round-trip guard warned about are left alone.
- A right-click menu: spelling suggestions and Add to Dictionary, cut, copy,
  paste and select all, Open Link and Copy Link, Copy Image.
- Markdown files dropped anywhere on the window open in tabs.
- Match Windows light or dark mode (off by default), with a theme for each.
- On Windows the caption buttons are the system's, so Maximize offers Snap
  Layouts; they take the theme's title bar colours.

### Readability

- The sidebar's hover and dividers used the title bar's colours and were
  invisible in five light themes; the sidebar now has its own tokens
  (`--sidebar-hover`, `--sidebar-border`, `--sidebar-muted`), and no longer
  dims text with opacity.
- `color-scheme` follows the theme, so dark themes get dark native controls.
- Menu shortcuts were drawn in the disabled colour (about 2:1); tab names,
  window title, status bar, the unsaved dot, find's on options and alert labels
  fell under 4.5:1 in some themes. All now reach it in every built-in theme,
  checked by a contrast suite. Alert colours are tokens (`--alert-*`).
- The application's text has its own font (`--ui-font`); it followed the
  document's, and turned serif in the serif themes.
- Windows open in the theme's colours, not a fixed dark one.

### Layout

- Menus had no height limit and ran off short windows; they now scroll, and
  submenus open inside the window.
- The find bar covered the tab bar; it now sits below it.
- The text column sat 36 px right of centre and was 72 px narrower than set;
  it is centred, with the text exactly the chosen width.
- Crepe's "Please enter..." placeholder showed in every empty line; an empty
  document now reads "Start writing, or type / for blocks".
- Close buttons use one drawn icon; Preferences' and the word count's show a
  hover.
- The active tab scrolls into view; Ctrl+Shift+Tab goes to the previous
  document; same-named files' tabs add their folder.

### Messages and first run

- Brief messages moved from the status bar's single slot, which they shared
  with its lasting warnings, to a stack of up to three above it. They can be
  dismissed, stay while pointed at, may carry actions, and errors are announced
  as alerts.
- Export HTML and Export PDF offer Open and Show in Folder. Main opens only a
  page or PDF it exported in this session.
- Save and Save As show "Saved"; auto-save does not.
- Save As for a new document suggests the first heading as its name, made safe
  for Windows, in the open folder.
- An image pasted into an Untitled document is held, with Save As offered; it
  was refused with a dialog and lost.
- The welcome screen shows the command palette, the `/` menu and Quick Start.
- The sidebar starts hidden and Open Folder shows it; its folder panels offer
  Open Folder, and folder search is disabled without a folder.
- The command palette lists themes and recent files.
- `--doc-muted` reaches 4.5:1 in every built-in theme; it was 3.5 to 4.4:1 in
  five.

### Long documents and folders

- A document forced into source view by its length says why, with Show
  Formatted. The status bar's lag warning shows only in the formatted view,
  beside any other warning, and switches to source view when clicked.
- The Outline marks the heading the caret is under (`aria-current`); both views
  report the caret at most once a frame. Its clicks work in source view, by
  line.
- Folder search results carry which match in their file they are, and open the
  file with that match selected and the term in the find bar. Match case (Aa).
- The file tree follows the disk: the watcher reports folders too, and the tree
  is read again after any change, keeping open folders open.
- Close Folder, beside the folder's name and in the palette; commands with no
  place in the menu carry labels and are listed in the palette.

### Keyboard and accessibility

- Dialogs give the focus back on closing, with the caret where it was, unless
  a command moved it; the palette, Open Quickly and Preferences keep `Tab`
  inside while open.
- Opening a file from the tree, Open Quickly, Open or Open Recent puts the
  focus in its editor.
- Alt letters for the menus (F E P O V T H), underlined while `Alt` is held.
- The file tree has tree roles, one Tab stop and arrow keys; the tab strip has
  one Tab stop, arrow keys, Home and End, and `Delete` to close.
- Menu toggles are `menuitemcheckbox`, choices `menuitemradio`; submenu items
  carry `aria-checked`. The palette and Open Quickly are comboboxes with
  `aria-activedescendant`.
- A keyboard shortcuts table in More Topics, checked against the menus by a
  test.

### Fixes

- A settings change could be undone by another made at the same moment: each
  sent a whole group from its own copy, and an older copy could arrive after a
  newer one. Changes now carry only their fields, and copies a revision.
- An editor built for an Untitled document resolved images against no folder
  even after Save As gave it one, so a newly added image showed broken.

- A file changed on disk while its tab was in the background came back showing
  the old text.
- Every new document warned that saving would reformat it.
- Saving a file the round-trip guard had warned about kept the warning up.
- One Ctrl+Z could undo two bursts of typing when the system clock was set back
  between them; undo steps now follow the time that actually passed.
- A file renamed while open could detach its tab instead of following the new
  name, when the watcher reported the removal and the new file separately.
- A pasted image showed broken until the file was reopened: images inside a line
  of text did not resolve their relative link for display.
- Recovered work was deleted unasked when its file's date looked newer than
  the work, which a clock set back or a file dated in the future could cause.
  It is now discarded only when the file already holds it.
- Escape on the crash-recovery question discarded the recovered work. It is now
  one question (Restore All / Not Now / Review), Not Now keeps the work, and
  Discard asks twice. Restored Untitled work keeps its journal, so it is not
  offered twice.
- The open folder was forgotten at every launch: the settings merge dropped it.
  A folder that has gone is closed with a notice.
- In source view, formatting commands and Find acted on another tab's hidden
  editor. Commands now reach only the active document's own editor.
- Readonly documents (Help topics) could be changed by commands, typed into in
  source view, and had pasted images saved beside them.
- Changing line endings did not mark the document edited.
- Opening from the sidebar, Open Quickly or Explorer failed silently.
- File ▸ Delete closed the tab and lost unsaved changes.
- Find's highlights in the formatted view were never styled; Enter in the find
  box moved focus into the document. Find and replace now work in source view.
- Export and Print said "Nothing to export" in source view, and code blocks out
  of sight in a long document exported empty.
- `[[Wiki links]]` were escaped on save as `\[\[Note]]`.
- Move Row Up/Down moved nothing; Delete Row/Column needed whole cells
  selected; Increase Heading always made level 1 and Decrease only worked at a
  heading's start; Ctrl+K made a link with no address; Copy as HTML Code and
  Copy without Theme Styling copied the editor's own markup, and every Copy As
  ignored the selection.
- Math Block, refused as "not modelled", inserts a LaTeX block (saved as
  `$$…$$`); the toolbar's math button is back.

- Opening a file by double-clicking it, or several at once, could leave the
  file unopened and show an empty Untitled instead.
- Closing a window while "Save changes?" was still open for more than four
  seconds closed the window.
- File ▸ Reload from Disk kept the old text on screen, and a save wrote it back.
- Reloading after another program changed a file you had edited kept the old
  encoding and line endings.
- A new window offered another window's unsaved work as recovered; closing a
  window with Don't Save kept the work to be offered back later.
- A file replaced with an older timestamp was saved over without asking.
- HTML and PDF export embedded any file an image link pointed at; now only real
  images, and never from a network path.
- The warning shown before saving a file that cannot be written back unchanged
  named what the file contained instead of what would change.
- A failed command did nothing visible; it now says so. A deleted recent file
  is removed from Open Recent.
- The settings file is written whole or not at all, so a crash mid-write no
  longer loses every setting.
- A window could stay hidden for good when its "ready to show" signal never came.
- Electron 44.4.5 and DOMPurify 3.4.16, for their security fixes.
- In a long document, Find now scrolls to the match it selects; it could stay
  out of sight.
- Large documents open sooner: one full pass over the document at open is
  gone, about a third of a second at 10,000 lines.

### Development

- The end-to-end suite runs locally on Linux in WSL (`npm run test:e2e:wsl`).
- `npm run bench:typing` measures typing and opening in 5,000- and
  10,000-line documents, with CPU profiles attributed to source files.

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
