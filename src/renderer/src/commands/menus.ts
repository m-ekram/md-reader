/**
 * The menu bar, as data.
 *
 * This file is the single description of the menu structure. The menu bar, the
 * context menus and the command palette all render from it, and an item whose
 * command has no implementation registered renders disabled automatically. That
 * is what lets later phases light up their own menu items simply by registering
 * commands, instead of this file stubbing a hundred handlers.
 */

export type MenuNode =
  | { kind: 'item'; id: string; label: string; accel?: string }
  | { kind: 'separator' }
  | { kind: 'submenu'; label: string; items: MenuNode[] }
  /** Filled at render time from application state (recent files, themes). */
  | { kind: 'dynamic'; source: 'recent' | 'themes'; label: string }

export interface Menu {
  label: string
  items: MenuNode[]
}

const sep: MenuNode = { kind: 'separator' }
const item = (id: string, label: string, accel?: string): MenuNode => ({
  kind: 'item',
  id,
  label,
  accel,
})

export const MENUS: Menu[] = [
  {
    label: 'File',
    items: [
      item('file.new', 'New', 'Ctrl+N'),
      item('file.newWindow', 'New Window', 'Ctrl+Shift+N'),
      sep,
      item('file.open', 'Open…', 'Ctrl+O'),
      item('file.openFolder', 'Open Folder…'),
      sep,
      item('file.openQuickly', 'Open Quickly…', 'Ctrl+P'),
      { kind: 'dynamic', source: 'recent', label: 'Open Recent' },
      item('file.reload', 'Reload from Disk'),
      sep,
      item('file.save', 'Save', 'Ctrl+S'),
      item('file.saveAs', 'Save As…', 'Ctrl+Shift+S'),
      item('file.moveTo', 'Move To…'),
      item('file.saveAll', 'Save All…'),
      sep,
      item('file.properties', 'Properties…'),
      item('file.openFileLocation', 'Open File Location…'),
      item('file.revealInSidebar', 'Reveal in Sidebar'),
      item('file.delete', 'Delete…'),
      sep,
      item('file.import', 'Import…'),
      {
        kind: 'submenu',
        label: 'Export',
        items: [item('file.exportPdf', 'PDF…'), item('file.exportHtml', 'HTML…')],
      },
      item('file.print', 'Print…', 'Alt+Shift+P'),
      sep,
      item('file.preferences', 'Preferences…', 'Ctrl+,'),
      sep,
      item('file.close', 'Close', 'Ctrl+W'),
    ],
  },
  {
    label: 'Edit',
    items: [
      item('edit.undo', 'Undo', 'Ctrl+Z'),
      item('edit.redo', 'Redo', 'Ctrl+Y'),
      sep,
      item('edit.cut', 'Cut', 'Ctrl+X'),
      item('edit.copy', 'Copy', 'Ctrl+C'),
      item('edit.copyImage', 'Copy Image Content'),
      item('edit.paste', 'Paste', 'Ctrl+V'),
      sep,
      item('edit.copyPlain', 'Copy as Plain Text'),
      item('edit.copyMarkdown', 'Copy as Markdown', 'Ctrl+Shift+C'),
      item('edit.copyHtml', 'Copy as HTML Code'),
      item('edit.copyUnstyled', 'Copy without Theme Styling'),
      sep,
      item('edit.pastePlain', 'Paste as Plain Text', 'Ctrl+Shift+V'),
      sep,
      {
        kind: 'submenu',
        label: 'Selection',
        items: [
          item('edit.selectAll', 'Select All', 'Ctrl+A'),
          item('edit.selectWord', 'Select Word'),
          item('edit.selectLine', 'Select Line'),
          item('edit.selectBlock', 'Select Block'),
        ],
      },
      item('edit.moveRowUp', 'Move Row Up', 'Alt+Up'),
      item('edit.moveRowDown', 'Move Row Down', 'Alt+Down'),
      sep,
      item('edit.delete', 'Delete'),
      {
        kind: 'submenu',
        label: 'Delete Range',
        items: [
          item('edit.deleteWord', 'Delete Word'),
          item('edit.deleteLine', 'Delete Line'),
          item('edit.deleteBlock', 'Delete Block'),
        ],
      },
      sep,
      {
        kind: 'submenu',
        label: 'Math Tools',
        items: [
          item('edit.mathInline', 'Inline Math'),
          item('edit.mathBlock', 'Math Block'),
          item('edit.mathPreview', 'Toggle Math Preview'),
        ],
      },
      sep,
      {
        kind: 'submenu',
        label: 'Smart Punctuation',
        items: [
          item('edit.smartQuotes', 'Smart Quotes'),
          item('edit.smartDashes', 'Smart Dashes'),
          item('edit.smartEllipses', 'Smart Ellipses'),
        ],
      },
      {
        kind: 'submenu',
        label: 'Line Endings',
        items: [item('edit.eolCrlf', 'Windows (CRLF)'), item('edit.eolLf', 'Unix (LF)')],
      },
      {
        kind: 'submenu',
        label: 'Whitespace and Line Breaks',
        items: [
          item('edit.showWhitespace', 'Show Whitespace'),
          item('edit.stripTrailing', 'Strip Trailing Spaces'),
        ],
      },
      item('edit.spellCheck', 'Spell Check…'),
      sep,
      {
        kind: 'submenu',
        label: 'Find and Replace',
        items: [
          item('edit.find', 'Find', 'Ctrl+F'),
          item('edit.findNext', 'Find Next', 'F3'),
          item('edit.findPrevious', 'Find Previous', 'Shift+F3'),
          item('edit.replace', 'Replace', 'Ctrl+H'),
        ],
      },
    ],
  },
  {
    label: 'Paragraph',
    items: [
      item('para.h1', 'Heading 1', 'Ctrl+1'),
      item('para.h2', 'Heading 2', 'Ctrl+2'),
      item('para.h3', 'Heading 3', 'Ctrl+3'),
      item('para.h4', 'Heading 4', 'Ctrl+4'),
      item('para.h5', 'Heading 5', 'Ctrl+5'),
      item('para.h6', 'Heading 6', 'Ctrl+6'),
      sep,
      item('para.paragraph', 'Paragraph', 'Ctrl+0'),
      sep,
      item('para.increaseHeading', 'Increase Heading Level', 'Ctrl+='),
      item('para.decreaseHeading', 'Decrease Heading Level', 'Ctrl+-'),
      sep,
      {
        kind: 'submenu',
        label: 'Table',
        items: [
          item('para.insertTable', 'Insert Table…'),
          item('para.addRowAbove', 'Add Row Above'),
          item('para.addRowBelow', 'Add Row Below'),
          item('para.addColBefore', 'Add Column Before'),
          item('para.addColAfter', 'Add Column After'),
          item('para.deleteRow', 'Delete Row'),
          item('para.deleteCol', 'Delete Column'),
        ],
      },
      item('para.mathBlock', 'Math Block', 'Ctrl+Shift+M'),
      item('para.codeFence', 'Code Fences', 'Ctrl+Shift+K'),
      {
        kind: 'submenu',
        label: 'Code Tools',
        items: [
          item('para.setLanguage', 'Set Language…'),
          item('para.copyCode', 'Copy Code Block'),
        ],
      },
      {
        kind: 'submenu',
        label: 'Alert',
        items: [
          item('para.alertNote', 'Note'),
          item('para.alertTip', 'Tip'),
          item('para.alertImportant', 'Important'),
          item('para.alertWarning', 'Warning'),
          item('para.alertCaution', 'Caution'),
        ],
      },
      sep,
      item('para.quote', 'Quote', 'Ctrl+Shift+Q'),
      sep,
      item('para.orderedList', 'Ordered List', 'Ctrl+Shift+['),
      item('para.unorderedList', 'Unordered List', 'Ctrl+Shift+]'),
      item('para.taskList', 'Task List', 'Ctrl+Shift+X'),
      {
        kind: 'submenu',
        label: 'Task Status',
        items: [item('para.taskDone', 'Complete'), item('para.taskTodo', 'Incomplete')],
      },
      {
        kind: 'submenu',
        label: 'List Indentation',
        items: [item('para.indent', 'Indent', 'Tab'), item('para.outdent', 'Outdent', 'Shift+Tab')],
      },
      sep,
      item('para.insertBefore', 'Insert Paragraph Before'),
      item('para.insertAfter', 'Insert Paragraph After'),
      sep,
      item('para.linkReference', 'Link Reference'),
      item('para.footnote', 'Footnotes'),
      sep,
      item('para.horizontalLine', 'Horizontal Line'),
      item('para.toc', 'Table of Contents'),
      item('para.frontMatter', 'YAML Front Matter'),
    ],
  },
  {
    label: 'Format',
    items: [
      item('format.strong', 'Strong', 'Ctrl+B'),
      item('format.emphasis', 'Emphasis', 'Ctrl+I'),
      item('format.underline', 'Underline', 'Ctrl+U'),
      item('format.code', 'Code', 'Ctrl+Shift+`'),
      sep,
      item('format.strike', 'Strike', 'Alt+Shift+5'),
      item('format.comment', 'Comment'),
      sep,
      item('format.hyperlink', 'Hyperlink', 'Ctrl+K'),
      {
        kind: 'submenu',
        label: 'Hyperlink Actions',
        items: [item('format.openLink', 'Open Link'), item('format.removeLink', 'Remove Link')],
      },
      {
        kind: 'submenu',
        label: 'Image',
        items: [
          item('format.insertImage', 'Insert Image…'),
          item('format.imageProperties', 'Image Properties…'),
        ],
      },
      sep,
      item('format.clear', 'Clear Format', 'Ctrl+\\'),
    ],
  },
  {
    label: 'View',
    items: [
      item('view.toggleSidebar', 'Toggle Sidebar', 'Ctrl+Shift+L'),
      item('view.outline', 'Outline', 'Ctrl+Shift+1'),
      item('view.articles', 'Articles', 'Ctrl+Shift+2'),
      item('view.fileTree', 'File Tree', 'Ctrl+Shift+3'),
      item('view.search', 'Search', 'Ctrl+Shift+F'),
      sep,
      item('view.sourceMode', 'Source Code Mode', 'Ctrl+/'),
      item('view.readonly', 'Readonly Mode'),
      sep,
      item('view.focusMode', 'Focus Mode', 'F8'),
      item('view.typewriter', 'Typewriter Mode', 'F9'),
      sep,
      item('view.statusBar', 'Status Bar'),
      item('view.toolbar', 'Toolbar'),
      item('view.wordCount', 'Toggle Word Count Popover'),
      sep,
      item('view.fullscreen', 'Toggle Fullscreen', 'F11'),
      item('view.alwaysOnTop', 'Always on Top'),
      sep,
      item('view.actualSize', 'Actual Size', 'Ctrl+Shift+9'),
      item('view.zoomIn', 'Zoom In', 'Ctrl+Shift+='),
      item('view.zoomOut', 'Zoom Out', 'Ctrl+Shift+-'),
      sep,
      item('view.switchDocs', 'Switch Between Opened Documents', 'Ctrl+Tab'),
      sep,
      item('view.devTools', 'Toggle DevTools', 'Shift+F12'),
    ],
  },
  {
    label: 'Themes',
    items: [{ kind: 'dynamic', source: 'themes', label: 'Themes' }],
  },
  {
    label: 'Help',
    items: [
      item('help.whatsNew', "What's New…"),
      sep,
      item('help.quickStart', 'Quick Start'),
      item('help.markdownReference', 'Markdown Reference'),
      item('help.customThemes', 'Custom Themes'),
      item('help.images', 'Use Images'),
      item('help.dataRecovery', 'Data Recovery and Version Control'),
      item('help.moreTopics', 'More Topics…'),
      sep,
      item('help.credits', 'Credits'),
      item('help.changeLog', 'Change Log'),
      item('help.website', 'Website'),
      item('help.feedback', 'Feedback'),
      sep,
      item('help.checkUpdates', 'Check Updates…'),
      item('help.about', 'About'),
    ],
  },
]

/** Every command id the menu references, for the menu contract test. */
export function allMenuCommandIds(nodes: MenuNode[] = MENUS.flatMap((m) => m.items)): string[] {
  const out: string[] = []
  for (const n of nodes) {
    if (n.kind === 'item') out.push(n.id)
    else if (n.kind === 'submenu') out.push(...allMenuCommandIds(n.items))
  }
  return out
}

/**
 * Commands that have no home in the menu.
 *
 * The menu is a fixed specification and is not grown to give a command
 * somewhere to live, so the few that live elsewhere (a shortcut, a button) are
 * listed here: bound alongside the menu, and found in the command palette.
 */
export const EXTRA_COMMANDS: Array<{ id: string; label: string; accel?: string }> = [
  { id: 'app.commandPalette', label: 'Command Palette', accel: 'Ctrl+Shift+P' },
  // The way back through the documents Ctrl+Tab goes forward through.
  { id: 'view.switchDocsBack', label: 'Previous Document', accel: 'Ctrl+Shift+Tab' },
  // A button beside the folder's name in the sidebar.
  { id: 'file.closeFolder', label: 'Close Folder' },
]

/** The ones with a shortcut, to bind. */
export const EXTRA_ACCELERATORS: Array<{ id: string; accel: string }> = EXTRA_COMMANDS.flatMap(
  (c) => (c.accel ? [{ id: c.id, accel: c.accel }] : [])
)

export interface FlatMenuItem {
  id: string
  label: string
  /** Where it sits, e.g. "Paragraph › Table", for disambiguation. */
  path: string
  accel?: string
}

/**
 * The menu flattened into a searchable list, each item carrying the path that
 * leads to it: several menus have an "Image" or a "Table", and the label alone
 * would not say which one is about to run.
 */
export function flattenMenu(menus: Menu[] = MENUS): FlatMenuItem[] {
  const out: FlatMenuItem[] = []
  const walk = (nodes: MenuNode[], trail: string[]): void => {
    for (const n of nodes) {
      if (n.kind === 'item')
        out.push({ id: n.id, label: n.label, path: trail.join(' › '), accel: n.accel })
      else if (n.kind === 'submenu') walk(n.items, [...trail, n.label])
    }
  }
  for (const menu of menus) walk(menu.items, [menu.label])
  return out
}
