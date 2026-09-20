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
  articles: [] as MarkdownFile[],
  loadingArticles: false,
  search: {
    query: '',
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

  state.tree = toNodes(await window.api.workspace.readDir(root))
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
  currentSearchId = await window.api.search.start(query)
}

export async function cancelSearch(): Promise<void> {
  currentSearchId = -1
  state.search.running = false
  await window.api.search.cancel()
}
