/**
 * The Help topics.
 *
 * They are markdown files opened in the application itself, which for a
 * markdown editor is both the obvious thing and the cheapest: no second format
 * to maintain, no browser to hand off to, and the documentation is rendered by
 * the same code it documents. They open readonly and with no path, so saving
 * one asks where to put it rather than writing over what shipped.
 */
import { app, ipcMain } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { log } from '../log'

export interface HelpDoc {
  title: string
  content: string
}

/**
 * The topics, by the id the menu commands use.
 *
 * An explicit map rather than reading whatever is in the folder: a typo in a
 * command id should fail here, not open an empty document.
 */
const TOPICS: Record<string, { file: string; title: string }> = {
  whatsNew: { file: 'whats-new.md', title: "What's New" },
  quickStart: { file: 'quick-start.md', title: 'Quick Start' },
  markdownReference: { file: 'markdown-reference.md', title: 'Markdown Reference' },
  customThemes: { file: 'custom-themes.md', title: 'Custom Themes' },
  images: { file: 'images.md', title: 'Use Images' },
  topics: { file: 'topics.md', title: 'More Topics' },
  credits: { file: 'credits.md', title: 'Credits' },
  changeLog: { file: 'changelog.md', title: 'Change Log' },
}

/**
 * Where the docs are.
 *
 * Packaged they are an extra resource beside the asar; in development they are
 * the folder in the repository. Both are checked against `app.isPackaged`
 * rather than by probing for the directory, so a missing file in a packaged
 * build fails loudly instead of silently reading the developer's copy.
 */
function docsDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'docs') : join(app.getAppPath(), 'docs')
}

export function registerHelpIpc(): void {
  ipcMain.handle('help:topic', async (_e, id: string): Promise<HelpDoc | null> => {
    const topic = TOPICS[id]
    if (!topic) {
      log.warn('unknown help topic', { id })
      return null
    }
    try {
      const content = await readFile(join(docsDir(), topic.file), 'utf8')
      return { title: topic.title, content }
    } catch (err) {
      log.error('could not read help topic', { id, err: String(err) })
      return null
    }
  })
}

/** Exported for the test that checks every topic has a file behind it. */
export const HELP_TOPICS = TOPICS
