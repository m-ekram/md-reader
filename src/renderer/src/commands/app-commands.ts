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
  markSaved,
  newDoc,
  setActive,
  useDocuments,
  type Doc,
} from '../stores/documents'
import type { SaveResult } from '../../../shared/ipc'
import { adoptFromDisk } from '../stores/external-changes'
import { patchSettings, setFontSize, stepFontSize, useSettingsStore } from '../stores/settings'
import { useThemeStore } from '../stores/theme'
import { chooseTheme } from '../stores/system-theme'
import { validFontSize } from '../stores/appearance'
import { refreshArticles, revealPath, setRoot, useWorkspace } from '../stores/workspace'
import { commandPalette, preferences, quickOpen, showNotice } from '../stores/ui'
import { flushAll } from '../editor/pool'

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
  // The store lags the editor by a debounce; without this, Ctrl+S straight
  // after typing wrote the file without the last keystrokes.
  flushAll()
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

  // Captured once: `savedContent` must be what was actually written, not
  // whatever the buffer holds after the awaits below.
  const request = {
    path,
    content: d.content,
    encoding: d.encoding,
    hasBom: d.hasBom,
    eol: d.eol,
  }

  let res = await window.api.file.save({
    ...request,
    // A brand-new path has nothing to conflict with.
    expectedMtimeMs: d.path === path ? d.mtimeMs : undefined,
  })

  if (!res.ok && res.reason === 'conflict') {
    if (!(await window.api.file.confirmOverwrite(d.name))) return false
    // Unconditional this time: the user has just chosen to replace the disk copy.
    res = await window.api.file.save(request)
  }

  // Every failure is reported. This used to return false silently for anything
  // but a conflict, so a read-only or locked file looked saved when it was not.
  if (!res.ok) {
    await window.api.file.reportSaveError(d.name, res.code, res.message)
    return false
  }

  Object.assign(d, {
    path,
    name: path.split(/[\\/]/).pop() ?? path,
    savedContent: request.content,
    savedEol: request.eol,
    mtimeMs: res.mtimeMs,
    // The file is now what the editor wrote, which it keeps exactly: the
    // warning about reformatting it has been acted on. Left in place, it also
    // kept auto-save away from the document for good.
    lossy: { lossy: false, note: '' },
  })
  if (previousJournalKey !== path) await window.api.file.discardRecovery(previousJournalKey)
  invalidateCommands()
  return true
}

/**
 * Writes a document back to its own file, refusing if another program has
 * changed the file since it was read or last saved. Asks nothing and reports
 * nothing: the caller decides what the user hears. For auto-save.
 */
export async function saveInPlace(d: Doc & { path: string }): Promise<SaveResult> {
  const content = d.content
  const eol = d.eol
  const res = await window.api.file.save({
    path: d.path,
    content,
    encoding: d.encoding,
    hasBom: d.hasBom,
    eol,
    expectedMtimeMs: d.mtimeMs,
  })
  if (res.ok) {
    markSaved(d, content, eol)
    d.mtimeMs = res.mtimeMs
    invalidateCommands()
  }
  return res
}

async function openFiles(): Promise<void> {
  const files = await window.api.file.openDialog()
  if (!files) return
  for (const f of files) adoptFile(f)
}

/**
 * Closes a document, prompting when it would discard unsaved work.
 *
 * The one way to close a tab. The tab's × button and middle-click used to call
 * the store's `closeDoc` directly, which removes the document without asking,
 * so a click on × threw away unsaved work while Ctrl+W prompted for it.
 *
 * Returns false when the user cancelled or the save they chose failed.
 */
export async function requestClose(index: number): Promise<boolean> {
  // The dirty check below reads the store, which lags the editor by a debounce.
  flushAll()
  const d = docs.docs[index]
  if (!d) return false

  if (isDirty(d)) {
    // Brought forward so the user can see which document they are asked
    // about, and because saving acts on the active document.
    setActive(index)
    const choice = await window.api.file.confirmClose([d.name])
    if (choice === 'cancel') return false
    if (choice === 'save' && !(await saveActive())) return false
    // Discarded on purpose, so it must not come back as a "recovery" on the
    // next launch.
    if (choice === 'discard') await window.api.file.discardRecovery(journalKey(d))
  }

  // Found again by identity: another tab may have closed during the awaits,
  // shifting every index after it.
  const at = docs.docs.indexOf(d)
  if (at >= 0) closeDoc(at)
  return true
}

async function closeActive(): Promise<void> {
  if (!activeDoc.value) {
    window.api.window.close()
    return
  }
  await requestClose(docs.activeIndex)
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
      flushAll()
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
      flushAll()
      const d = activeDoc.value
      if (!d?.path) return
      if (isDirty(d)) {
        const choice = await window.api.file.confirmClose([d.name])
        if (choice === 'cancel') return
        if (choice === 'save' && !(await saveActive())) return
      }
      adoptFromDisk(d, await window.api.file.read(d.path))
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
      // Edits made since the last save were thrown away with the tab. They
      // stay open instead, as a document whose file is gone, which Save puts
      // back.
      flushAll()
      if (isDirty(d)) {
        d.detached = true
        showNotice(
          `“${d.name}” was moved to the Recycle Bin. Its unsaved changes are still open here.`
        )
        invalidateCommands()
      } else {
        closeDoc(docs.docs.indexOf(d))
      }
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
  // Zoom is the document's text size; the chrome keeps its size. See appearance.ts.
  {
    id: 'view.actualSize',
    checked: () => validFontSize(settings.value.editor.fontSize) === null,
    run: () => void setFontSize(null),
  },
  { id: 'view.zoomIn', run: () => void stepFontSize(1) },
  { id: 'view.zoomOut', run: () => void stepFontSize(-1) },
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

The version currently open will be replaced. It is not written to disk until you save, so you can undo this.`,
        'Restore',
        'Cancel'
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
    run: () => window.api.app.about(),
  },
]

let alwaysOnTop = false

/** Theme commands are generated from whatever themes are installed. */
export function registerThemeCommands(): void {
  registerAll(
    theme.available.map((t) => ({
      id: `theme.${t.id}`,
      enabled: () => theme.isImplemented(t.id) || !t.builtin,
      checked: () => theme.current === t.id,
      run: () => chooseTheme(t.id),
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
        try {
          adoptFile(await window.api.file.read(path))
        } catch (err) {
          if (!/ENOENT/.test(String(err))) throw err
          // Moved or deleted since: say so, and stop offering it.
          await patchSettings({ recentFiles: settings.value.recentFiles.filter((p) => p !== path) })
          const name = path.split(/[\\/]/).pop() ?? path
          showNotice(
            `“${name}” is no longer at ${path}, so it was removed from Open Recent.`,
            'error'
          )
        }
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
  bindAccelerators([...collectAccelerators(MENUS.flatMap((m) => m.items)), ...EXTRA_ACCELERATORS])
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
