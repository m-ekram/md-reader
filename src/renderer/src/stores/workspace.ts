/**
 * The opened folder, as the renderer sees it: the lazy tree, the flat markdown
 * list behind Articles and Open Quickly, and live search state.
 */
import { reactive, ref } from 'vue'
import type { DirEntry, MarkdownFile } from '../../../main/workspace'
import type { SearchHit } from '../../../main/search-worker'
import { watch } from 'vue'
import { invalidateCommands } from '../commands/registry'
import { useSettingsStore } from './settings'
import { showNotice } from './ui'
import { openPath } from './documents'
import { describeError } from '../utils/report'

export interface TreeNode {
  entry: DirEntry
  expanded: boolean
  /** Undefined until the folder is expanded; folders load their own children. */
  children?: TreeNode[]
  loading: boolean
}

const state = reactive({
  root: null as string | null,
  tree: [] as TreeNode[],
  /** The tree row last focused: the one Tab returns to. */
  treeFocus: '',
  /** A name being typed in the tree: for a new file or folder in `dir`. */
  treeEdit: null as null | { kind: 'file' | 'folder'; dir: string },
  articles: [] as MarkdownFile[],
  loadingArticles: false,
  search: {
    query: '',
    /** Match case; off by default, as the find bar's is. */
    caseSensitive: false,
    hits: [] as SearchHit[],
    running: false,
    truncated: false,
  },
})

export function useWorkspace() {
  return state
}

export const workspaceName = ref<string>('')

function toNodes(entries: DirEntry[]): TreeNode[] {
  return entries.map((entry) => ({ entry, expanded: false, loading: false }))
}

export async function setRoot(root: string | null): Promise<void> {
  state.root = root
  workspaceName.value = root ? (root.split(/[\\/]/).filter(Boolean).pop() ?? root) : ''
  state.tree = []
  state.articles = []
  invalidateCommands()
  if (!root) return

  let entries: DirEntry[]
  try {
    entries = await window.api.workspace.readDir(root)
  } catch {
    // Moved, deleted, or on a drive that is not there today. Said once, and
    // forgotten, rather than failing out of sight at every launch.
    if (state.root !== root) return
    showNotice(`The folder ${root} could not be opened, so it was closed.`, 'error')
    await window.api.workspace.set(null)
    return
  }
  if (state.root !== root) return
  state.tree = toNodes(entries)
  void refreshArticles()
}

export async function refreshArticles(): Promise<void> {
  if (!state.root) return
  state.loadingArticles = true
  try {
    state.articles = await window.api.workspace.allMarkdown(state.root)
  } finally {
    state.loadingArticles = false
  }
}

/**
 * Reads the tree again, keeping open folders open.
 *
 * It was read once, when the folder opened, so files and folders made or
 * removed afterwards never showed, or never went away. The watcher now calls
 * this after any change.
 */
export async function refreshTree(): Promise<void> {
  const root = state.root
  if (!root) return
  const open = new Set<string>()
  const collect = (nodes: TreeNode[]): void => {
    for (const n of nodes) {
      if (n.expanded) open.add(n.entry.path.toLowerCase())
      if (n.children) collect(n.children)
    }
  }
  collect(state.tree)

  const load = async (dir: string): Promise<TreeNode[]> => {
    const nodes = toNodes(await window.api.workspace.readDir(dir))
    for (const n of nodes) {
      if (!n.entry.isDirectory || !open.has(n.entry.path.toLowerCase())) continue
      n.expanded = true
      n.children = await load(n.entry.path).catch(() => [])
    }
    return nodes
  }
  try {
    const tree = await load(root)
    if (state.root === root) state.tree = tree
  } catch {
    // The folder itself has gone; opening it again says so.
  }
}

/** The folder a path is in. */
export function folderOf(path: string): string {
  return path.slice(0, Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/')))
}

function findNode(path: string, nodes = state.tree): TreeNode | null {
  for (const n of nodes) {
    if (n.entry.path === path) return n
    const inner = n.children ? findNode(path, n.children) : null
    if (inner) return inner
  }
  return null
}

/**
 * Asks for the name of a new file or folder, in the tree where it will go.
 * The folder is opened first, so the name box shows among its contents.
 */
export async function startCreate(kind: 'file' | 'folder', dir: string): Promise<void> {
  const node = findNode(dir)
  if (node && !node.expanded) await toggleNode(node)
  state.treeEdit = { kind, dir }
}

/**
 * Makes the file or folder named. A new file opens, ready to type in. A name
 * that is taken or not allowed is said, and nothing is made.
 */
export async function commitCreate(name: string): Promise<void> {
  const edit = state.treeEdit
  state.treeEdit = null
  if (!edit || !name.trim()) return
  try {
    const path =
      edit.kind === 'file'
        ? await window.api.fileops.createFile(edit.dir, name.trim())
        : await window.api.fileops.createFolder(edit.dir, name.trim())
    await refreshTree()
    void refreshArticles()
    if (edit.kind === 'file') await openPath(path)
  } catch (err) {
    showNotice(describeError(err), 'error')
  }
}

export async function toggleNode(node: TreeNode): Promise<void> {
  if (!node.entry.isDirectory) return
  node.expanded = !node.expanded
  if (!node.expanded || node.children) return

  node.loading = true
  try {
    node.children = toNodes(await window.api.workspace.readDir(node.entry.path))
  } catch {
    node.children = []
  } finally {
    node.loading = false
  }
}

/** Expands the tree down to a path, so Reveal in Sidebar can show a file. */
export async function revealPath(target: string): Promise<void> {
  if (!state.root || !target.toLowerCase().startsWith(state.root.toLowerCase())) return

  const rest = target.slice(state.root.length).split(/[\\/]/).filter(Boolean)
  let level = state.tree
  let prefix = state.root

  for (const segment of rest.slice(0, -1)) {
    prefix = `${prefix}\\${segment}`
    const node = level.find((n) => n.entry.path.toLowerCase() === prefix.toLowerCase())
    if (!node) return
    if (!node.expanded || !node.children) {
      node.expanded = true
      if (!node.children) {
        node.loading = true
        node.children = toNodes(await window.api.workspace.readDir(node.entry.path))
        node.loading = false
      }
    }
    level = node.children ?? []
  }
}

/**
 * Follows the workspace recorded in settings.
 *
 * Main broadcasts settings changes to every window, so opening a folder in one
 * window moves them all to the same workspace rather than leaving them
 * disagreeing about which folder is open.
 */
export function initWorkspaceSync(): void {
  const settings = useSettingsStore()
  watch(
    () => settings.value.workspace,
    (root) => {
      if ((root ?? null) !== state.root) void setRoot(root ?? null)
    },
    { immediate: true }
  )
}

// --- search -----------------------------------------------------------------

let currentSearchId = -1

export function initSearchListeners(): void {
  window.api.search.onHit(({ id, hit }) => {
    // Results stream in; a hit from a superseded query must not appear.
    if (id !== currentSearchId) return
    if (state.search.hits.length >= 2000) {
      state.search.truncated = true
      return
    }
    state.search.hits.push(hit)
  })

  window.api.search.onDone(({ id }) => {
    if (id !== currentSearchId) return
    state.search.running = false
  })
}

export async function runSearch(query: string): Promise<void> {
  state.search.query = query
  state.search.hits = []
  state.search.truncated = false

  if (query.trim().length < 2) {
    // One character matches nearly everything; the walk would be wasted work.
    state.search.running = false
    await window.api.search.cancel()
    currentSearchId = -1
    return
  }

  state.search.running = true
  currentSearchId = await window.api.search.start(query, state.search.caseSensitive)
}

/** Turns match case on or off, and searches again. */
export async function setSearchCase(on: boolean): Promise<void> {
  state.search.caseSensitive = on
  await runSearch(state.search.query)
}

export async function cancelSearch(): Promise<void> {
  currentSearchId = -1
  state.search.running = false
  await window.api.search.cancel()
}
