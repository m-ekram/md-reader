/**
 * Phase 1 command implementations.
 *
 * Only what this phase actually supports is registered. Everything else in the
 * menu renders disabled with a tooltip, which is the intended behaviour: the
 * full menu is visible from day one, and later phases light up their own items
 * by registering here.
 */
import { watch } from 'vue'
import { EXTRA_ACCELERATORS, MENUS, type MenuNode } from './menus'
import { bindAccelerators, invalidateCommands, registerAll, type Command } from './registry'
import {
  activeDoc,
  adoptFile,
  anyDirty,
  closeDoc,
  isDirty,
  journalKey,
  newDoc,
  setActive,
  useDocuments,
} from '../stores/documents'
import { patchSettings, useSettingsStore } from '../stores/settings'
import { applyTheme, useThemeStore } from '../stores/theme'
import { refreshArticles, revealPath, setRoot, useWorkspace } from '../stores/workspace'
import { commandPalette, preferences, quickOpen } from '../stores/ui'

const docs = useDocuments()
const settings = useSettingsStore()
const theme = useThemeStore()
const ws = useWorkspace()

type PanelId = 'outline' | 'articles' | 'files' | 'search'

/** Shows a sidebar panel, revealing the sidebar if it is hidden. */
async function showPanel(panel: PanelId): Promise<void> {
  await patchSettings({ sidebar: { ...settings.value.sidebar, panel, visible: true } })
}

const panelIsActive = (panel: PanelId) => () =>
  settings.value.sidebar.visible && settings.value.sidebar.panel === panel

const hasDoc = () => activeDoc.value !== null
const hasPath = () => !!activeDoc.value?.path

export async function saveActive(saveAs = false): Promise<boolean> {
  const d = activeDoc.value
  if (!d) return false

  // An untitled buffer is journalled under a synthetic key. Once it has a real
  // path the old entry would linger and be offered back forever, so remember it
  // and discard it after the save succeeds.
  const previousJournalKey = journalKey(d)
  let path = d.path
  if (!path || saveAs) {
    path = await window.api.file.saveAsDialog(path ?? `${d.name}.md`)
    if (!path) return false
  }

  const res = await window.api.file.save({
    path,
    content: d.content,
    encoding: d.encoding,
    hasBom: d.hasBom,
    eol: d.eol,
    // A brand-new path has nothing to conflict with.
    expectedMtimeMs: d.path === path ? d.mtimeMs : undefined,
  })

  if (!res.ok) {
    if (res.reason === 'conflict') {
      const choice = await window.api.file.confirmClose([`${d.name} (changed on disk)`])
      if (choice !== 'save') return false
      const forced = await window.api.file.save({
        path,
        content: d.content,
        encoding: d.encoding,
        hasBom: d.hasBom,
        eol: d.eol,
      })
      if (!forced.ok) return false
      Object.assign(d, {
        path,
        name: path.split(/[\\/]/).pop(),
        savedContent: d.content,
        mtimeMs: forced.mtimeMs,
      })
      invalidateCommands()
      return true
    }
    return false
  }

  Object.assign(d, {
    path,
    name: path.split(/[\\/]/).pop() ?? path,
    savedContent: d.content,
    mtimeMs: res.mtimeMs,
  })
  if (previousJournalKey !== path) await window.api.file.discardRecovery(previousJournalKey)
  invalidateCommands()
  return true
}

async function openFiles(): Promise<void> {
  const files = await window.api.file.openDialog()
  if (!files) return
  for (const f of files) adoptFile(f)
}

/** Closes a document, prompting when it would discard unsaved work. */
async function closeActive(): Promise<void> {
  const d = activeDoc.value
  if (!d) {
    window.api.window.close()
    return
  }
  if (isDirty(d)) {
    const choice = await window.api.file.confirmClose([d.name])
    if (choice === 'cancel') return
    if (choice === 'save' && !(await saveActive())) return
  }
  closeDoc(docs.activeIndex)
}

const commands: Command[] = [
  { id: 'file.new', run: () => void newDoc() },
  { id: 'file.newWindow', run: () => window.api.window.newWindow() },
  { id: 'file.open', run: openFiles },
  { id: 'file.save', enabled: hasDoc, run: () => void saveActive(false) },
  { id: 'file.saveAs', enabled: hasDoc, run: () => void saveActive(true) },
  {
    id: 'file.saveAll',
    enabled: () => anyDirty(),
    run: async () => {
      const start = docs.activeIndex
      for (let i = 0; i < docs.docs.length; i++) {
        if (isDirty(docs.docs[i])) {
          setActive(i)
          await saveActive(false)
        }
      }
      setActive(start)
    },
  },
  {
    id: 'file.reload',
    enabled: hasPath,
    run: async () => {
      const d = activeDoc.value
      if (!d?.path) return
      if (isDirty(d)) {
        const choice = await window.api.file.confirmClose([d.name])
        if (choice === 'cancel') return
        if (choice === 'save' && !(await saveActive())) return
      }
      const f = await window.api.file.read(d.path)
      Object.assign(d, {
        content: f.content,
        savedContent: f.content,
        mtimeMs: f.mtimeMs,
        lossy: null,
      })
      invalidateCommands()
    },
  },
  {
    id: 'file.openFileLocation',
    enabled: hasPath,
    run: () => void window.api.file.showInFolder(activeDoc.value!.path!),
  },
  { id: 'file.close', run: closeActive },

  // Workspace
  {
    id: 'file.openFolder',
    run: async () => {
      const root = await window.api.workspace.openDialog()
      if (root) await setRoot(root)
    },
  },
  {
    id: 'file.revealInSidebar',
    enabled: () => hasPath() && ws.root !== null,
    run: async () => {
      const path = activeDoc.value?.path
      if (!path) return
      await patchSettings({ sidebar: { ...settings.value.sidebar, panel: 'files', visible: true } })
      await revealPath(path)
    },
  },
  {
    id: 'file.properties',
    enabled: hasPath,
    run: async () => {
      const path = activeDoc.value!.path!
      const p = await window.api.fileops.properties(path)
      const kb = (p.size / 1024).toFixed(1)
      await window.api.app.info(
        p.name,
        [
          p.path,
          '',
          `Size: ${kb} KB (${p.size} bytes)`,
          `Modified: ${new Date(p.modifiedMs).toLocaleString()}`,
          `Created: ${new Date(p.createdMs).toLocaleString()}`,
        ].join('\n')
      )
    },
  },
  {
    id: 'file.moveTo',
    enabled: hasPath,
    run: async () => {
      const d = activeDoc.value
      if (!d?.path) return
      const moved = await window.api.fileops.move(d.path)
      if (!moved) return
      Object.assign(d, { path: moved, name: moved.split(/[\\/]/).pop() ?? moved })
      await refreshArticles()
      invalidateCommands()
    },
  },
  {
    id: 'file.delete',
    enabled: hasPath,
    run: async () => {
      const d = activeDoc.value
      if (!d?.path) return
      const deleted = await window.api.fileops.delete(d.path)
      if (!deleted) return
      closeDoc(docs.activeIndex)
      await refreshArticles()
    },
  },

  {
    id: 'file.openQuickly',
    enabled: () => ws.root !== null,
    run: () => {
      quickOpen.open = true
    },
  },

  /**
   * The command palette. Keyboard-only: the menu is a fixed specification and
   * gains no item for it, so its accelerator is bound from EXTRA_ACCELERATORS.
   */
  {
    id: 'file.preferences',
    run: () => {
      preferences.open = true
    },
  },

  {
    id: 'app.commandPalette',
    label: 'Command Palette',
    run: () => {
      commandPalette.open = true
    },
  },

  // Sidebar panels
  {
    id: 'view.toggleSidebar',
    checked: () => settings.value.sidebar.visible,
    run: () =>
      void patchSettings({
        sidebar: { ...settings.value.sidebar, visible: !settings.value.sidebar.visible },
      }),
  },
  { id: 'view.outline', checked: panelIsActive('outline'), run: () => showPanel('outline') },
  { id: 'view.articles', checked: panelIsActive('articles'), run: () => showPanel('articles') },
  { id: 'view.fileTree', checked: panelIsActive('files'), run: () => showPanel('files') },
  { id: 'view.search', checked: panelIsActive('search'), run: () => showPanel('search') },

  // View — the toggles Phase 1 can honour.
  {
    id: 'view.statusBar',
    checked: () => settings.value.statusBar,
    run: () => void patchSettings({ statusBar: !settings.value.statusBar }),
  },
  { id: 'view.fullscreen', run: () => window.api.window.toggleFullscreen() },
  { id: 'view.devTools', run: () => window.api.window.toggleDevTools() },
  {
    id: 'view.alwaysOnTop',
    checked: () => alwaysOnTop,
    run: () => {
      alwaysOnTop = !alwaysOnTop
      window.api.window.setAlwaysOnTop(alwaysOnTop)
    },
  },
  { id: 'view.actualSize', run: () => setZoom(0) },
  { id: 'view.zoomIn', run: () => setZoom(zoom + 0.5) },
  { id: 'view.zoomOut', run: () => setZoom(zoom - 0.5) },
  {
    id: 'view.switchDocs',
    enabled: () => docs.docs.length > 1,
    run: () => setActive((docs.activeIndex + 1) % docs.docs.length),
  },

  /**
   * Restores the copy taken immediately before the last save.
   *
   * Backups were written from the very first save but nothing could read them
   * back, so the mechanism looked like protection and provided none. This is
   * the other half: the way out of a save that wrote something wrong, which for
   * an editor that re-serializes markdown is a real possibility.
   */
  {
    id: 'help.dataRecovery',
    enabled: hasPath,
    run: async () => {
      const d = activeDoc.value
      if (!d?.path) return

      const info = await window.api.file.backupInfo(d.path)
      if (!info.exists || info.content === undefined) {
        await window.api.app.info(
          'No backup available',
          `No previous version of ${d.name} has been kept yet.

A backup is written each time the file is saved, so there will be one after the next save.`
        )
        return
      }

      if (info.content === d.content) {
        await window.api.app.info(
          'Backup matches the current document',
          'The kept version is identical to what is open, so there is nothing to restore.'
        )
        return
      }

      const when = info.savedAtMs ? new Date(info.savedAtMs).toLocaleString() : 'an earlier save'
      const restore = await window.api.app.confirm(
        `Restore the previous version of ${d.name}?`,
        `Kept just before the save at ${when}.

The version currently open will be replaced. It is not written to disk until you save, so you can undo this.`
      )
      if (!restore) return

      // Content only: the file keeps its current encoding and line endings, and
      // nothing touches the disk until the user saves.
      d.content = info.content
      d.reloadToken++
      invalidateCommands()
    },
  },

  // Help
  {
    id: 'help.website',
    run: () => void window.api.app.openExternal('https://github.com/m-ekram/md-reader'),
  },
  {
    id: 'help.about',
    run: async () => {
      const v = await window.api.app.version()
      await window.api.app.info('ekram.md', `Version ${v}`)
    },
  },
]

let alwaysOnTop = false
let zoom = 0
function setZoom(level: number): void {
  zoom = Math.max(-3, Math.min(6, level))
  window.api.window.setZoom(zoom)
  invalidateCommands()
}

/** Theme commands are generated from whatever themes are installed. */
export function registerThemeCommands(): void {
  registerAll(
    theme.available.map((t) => ({
      id: `theme.${t.id}`,
      enabled: () => theme.isImplemented(t.id) || !t.builtin,
      checked: () => theme.current === t.id,
      run: async () => {
        await applyTheme(t.id)
        await patchSettings({ theme: t.id })
      },
    }))
  )
  rebindAccelerators()
}

/**
 * Recent-file entries are positional slots, not captured paths.
 *
 * The list is reordered on every open and save. Capturing the path at
 * registration time meant the menu label and the command drifted apart, so
 * clicking an entry opened a different file than the one it named. Resolving
 * the path when the command runs keeps it consistent with what is on screen,
 * which reads from the same array.
 */
const MAX_RECENT = 15

export function registerRecentCommands(): void {
  registerAll(
    Array.from({ length: MAX_RECENT }, (_, i) => ({
      id: `file.recent.${i}`,
      enabled: () => settings.value.recentFiles[i] !== undefined,
      run: async () => {
        const path = settings.value.recentFiles[i]
        if (!path) return
        adoptFile(await window.api.file.read(path))
      },
    }))
  )
}

function collectAccelerators(nodes: MenuNode[]): Array<{ id: string; accel?: string }> {
  const out: Array<{ id: string; accel?: string }> = []
  for (const n of nodes) {
    if (n.kind === 'item') out.push({ id: n.id, accel: n.accel })
    else if (n.kind === 'submenu') out.push(...collectAccelerators(n.items))
  }
  return out
}

function rebindAccelerators(): void {
  bindAccelerators([
    ...collectAccelerators(MENUS.flatMap((m) => m.items)),
    ...EXTRA_ACCELERATORS,
  ])
}

export function registerAppCommands(): void {
  registerAll(commands)
  rebindAccelerators()
}

/**
 * Re-registers the generated command groups whenever the state they are derived
 * from changes, so a theme dropped into the themes folder becomes usable without
 * a restart.
 */
export function watchGeneratedCommands(): void {
  watch(
    () => theme.available.map((t) => t.id).join(','),
    () => registerThemeCommands()
  )
}
