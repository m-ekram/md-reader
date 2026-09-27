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

### Fixes

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

### Development

- The end-to-end suite runs locally on Linux in WSL (`npm run test:e2e:wsl`).

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
