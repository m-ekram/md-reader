/**
 * The Help menu.
 *
 * The topics open as readonly documents in the editor itself. For a markdown
 * editor that is the natural form — the documentation is rendered by the same
 * code it documents, so a rendering bug shows up in the help rather than hiding
 * there — and it costs no second format and no browser hand-off.
 *
 * Each topic opens once: choosing it again brings its tab forward instead of
 * stacking up copies.
 */
import { markSaved, useDocuments, newDoc, setActive } from '../stores/documents'
import { showNotice } from '../stores/ui'
import { invalidateCommands, registerAll, type Command } from './registry'
import { ISSUES_URL } from '../../../shared/project'

const docs = useDocuments()

/**
 * Opens a help topic, or focuses it if it is already open.
 *
 * Readonly and without a path: these are shipped files, so an accidental
 * keystroke must not edit them and Ctrl+S must not write over them. Saving one
 * asks where to put it, which is the right answer for someone who wants to keep
 * their own annotated copy.
 */
async function openTopic(id: string): Promise<void> {
  const existing = docs.docs.findIndex((d) => d.helpTopic === id)
  if (existing >= 0) {
    setActive(existing)
    return
  }

  const topic = await window.api.help.topic(id)
  if (!topic) {
    showNotice('That help topic could not be opened.', 'error')
    return
  }

  const doc = newDoc()
  doc.name = topic.title
  doc.content = topic.content
  // Saved content matches, so the tab does not open already dirty.
  markSaved(doc, topic.content, doc.eol)
  doc.readonly = true
  doc.helpTopic = id
  invalidateCommands()
}

// Written out rather than generated from a table of pairs: the ids stay
// greppable, which is how the menu-coverage script counts them and how anyone
// looking for "where does help.quickStart live" finds it.
const helpCommands: Command[] = [
  { id: 'help.whatsNew', run: () => openTopic('whatsNew') },
  { id: 'help.quickStart', run: () => openTopic('quickStart') },
  { id: 'help.markdownReference', run: () => openTopic('markdownReference') },
  { id: 'help.customThemes', run: () => openTopic('customThemes') },
  { id: 'help.images', run: () => openTopic('images') },
  { id: 'help.moreTopics', run: () => openTopic('topics') },
  { id: 'help.credits', run: () => openTopic('credits') },
  { id: 'help.changeLog', run: () => openTopic('changeLog') },

  {
    id: 'help.feedback',
    run: () => void window.api.app.openExternal(ISSUES_URL),
  },

  // Against the project's GitHub Releases; the answer comes back as a notice
  // (stores/updates.ts), whatever it is.
  { id: 'help.checkUpdates', run: () => window.api.updates.check() },
]

export function registerHelpCommands(): void {
  registerAll(helpCommands)
}
