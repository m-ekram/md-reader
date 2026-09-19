/**
 * Phase 1 command implementations.
 *
 * Only what this phase actually supports is registered. Everything else in the
 * menu renders disabled with a tooltip, which is the intended behaviour: the
 * full menu is visible from day one, and later phases light up their own items
 * by registering here.
 */
import { MENUS, type MenuNode } from './menus'
import { bindAccelerators, invalidateCommands, registerAll, type Command } from './registry'
import {
  activeDoc,
  adoptFile,
  anyDirty,
  closeDoc,
  isDirty,
  newDoc,
  setActive,
  useDocuments,
} from '../stores/documents'
import { patchSettings, useSettingsStore } from '../stores/settings'
import { applyTheme, useThemeStore } from '../stores/theme'

const docs = useDocuments()
const settings = useSettingsStore()
const theme = useThemeStore()

const hasDoc = () => activeDoc.value !== null
const hasPath = () => !!activeDoc.value?.path

export async function saveActive(saveAs = false): Promise<boolean> {
  const d = activeDoc.value
  if (!d) return false

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
      Object.assign(d, { path, name: path.split(/[\\/]/).pop(), savedContent: d.content, mtimeMs: forced.mtimeMs })
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
      Object.assign(d, { content: f.content, savedContent: f.content, mtimeMs: f.mtimeMs, lossy: null })
      invalidateCommands()
    },
  },
  {
    id: 'file.openFileLocation',
    enabled: hasPath,
    run: () => void window.api.file.showInFolder(activeDoc.value!.path!),
  },
  { id: 'file.close', run: closeActive },

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

  // Help
  { id: 'help.website', run: () => void window.api.app.openExternal('https://github.com/m-ekram/md-reader') },
  {
    id: 'help.about',
    run: async () => {
      const v = await window.api.app.version()
      window.alert(`ekram.md ${v}`)
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

/** Recent-file entries are positional, so they are registered as a block. */
export function registerRecentCommands(): void {
  registerAll(
    settings.value.recentFiles.map((path, i) => ({
      id: `file.recent.${i}`,
      run: async () => {
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
  bindAccelerators(collectAccelerators(MENUS.flatMap((m) => m.items)))
}

export function registerAppCommands(): void {
  registerAll(commands)
  rebindAccelerators()
}
