/**
 * Mermaid diagrams in ```mermaid fences.
 *
 * Three constraints shape this:
 *
 *  - Mermaid is roughly a megabyte, so it is imported dynamically on first use.
 *    A session that never opens a diagram never pays for it, and cold start is
 *    unaffected.
 *  - A diagram is re-rendered while it is being typed, and a half-typed diagram
 *    is a syntax error most of the time. Failures render inline and quietly
 *    rather than throwing, and results are debounced.
 *  - Nothing here touches the schema. A mermaid fence is an ordinary
 *    `code_block` with `language: "mermaid"`, so the source round-trips through
 *    the existing code-block handling and survives even when Mermaid cannot
 *    parse it. The preview is a decoration layered on top, driven by the
 *    document rather than by scraping the DOM, which would be at the mercy of
 *    however the code-block widget happens to render.
 */
import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { EditorState } from '@milkdown/kit/prose/state'
import type { MilkdownPlugin } from '@milkdown/kit/ctx'
import { isDarkTheme } from '../utils/dark'

type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void
  render: (id: string, text: string) => Promise<{ svg: string }>
}

let mermaidPromise: Promise<MermaidApi> | null = null
let idCounter = 0

async function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => {
      const api = (m.default ?? m) as unknown as MermaidApi
      api.initialize({
        startOnLoad: false,
        theme: isDarkTheme() ? 'dark' : 'default',
        securityLevel: 'strict',
        fontFamily: 'inherit',
      })
      return api
    })
  }
  return mermaidPromise
}

/** Drops the cached instance so the next render picks up a new theme. */
export function resetMermaid(): void {
  mermaidPromise = null
  renderCache.clear()
  inflight.clear()
}

export interface RenderResult {
  ok: boolean
  svg?: string
  error?: string
}

/**
 * Mermaid does not always settle.
 *
 * A parse failure that follows a successful render can leave its internal work
 * queue wedged, and the returned promise then never resolves or rejects. Left
 * alone that shows as a diagram stuck in its loading state for the rest of the
 * session, with no way back. Racing a timeout turns a hang into an ordinary
 * error the user can see and edit their way out of.
 */
const RENDER_TIMEOUT_MS = 8000

export async function renderMermaid(source: string): Promise<RenderResult> {
  const text = source.trim()
  if (text.length === 0) return { ok: false, error: 'Empty diagram' }

  try {
    const mermaid = await loadMermaid()

    const render = mermaid
      .render(`mermaid-svg-${++idCounter}`, text)
      .then(({ svg }): RenderResult => ({ ok: true, svg }))

    const timeout = new Promise<RenderResult>((resolve) =>
      setTimeout(
        () => resolve({ ok: false, error: 'Diagram could not be rendered (timed out)' }),
        RENDER_TIMEOUT_MS
      )
    )

    const result = await Promise.race([render, timeout])
    // A wedged instance stays wedged, so retire it and let the next diagram
    // start from a clean one.
    if (!result.ok) mermaidPromise = null
    return result
  } catch (err) {
    // A diagram mid-edit is usually invalid. That is expected, not a fault.
    mermaidPromise = null
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Keyed by source, so retyping the same diagram does not re-render it. */
const renderCache = new Map<string, RenderResult>()
const MAX_CACHE = 50

/**
 * Renders in flight, keyed by source.
 *
 * ProseMirror can replace a widget's element while its render is still running.
 * Without sharing, each replacement would start another render of the same
 * diagram, and the result of the first would be thrown away with the element
 * that asked for it — which left diagrams stuck in their loading state
 * permanently.
 */
const inflight = new Map<string, Promise<RenderResult>>()

function renderInto(el: HTMLElement, source: string): void {
  const cached = renderCache.get(source)
  if (cached) {
    apply(el, cached)
    return
  }

  // Keep whatever is already shown while the render runs, so the diagram does
  // not blink out on every keystroke.
  el.classList.add('is-pending')

  let pending = inflight.get(source)
  if (!pending) {
    pending = renderMermaid(source).then((result) => {
      if (renderCache.size >= MAX_CACHE) {
        renderCache.delete(renderCache.keys().next().value as string)
      }
      renderCache.set(source, result)
      inflight.delete(source)
      return result
    })
    inflight.set(source, pending)
  }

  // Applied whether or not this element is still attached: if it was replaced
  // the write is harmless, and the cache now serves its replacement.
  void pending.then((result) => apply(el, result))
}

function apply(el: HTMLElement, result: RenderResult): void {
  el.classList.remove('is-pending')
  if (result.ok && result.svg) {
    el.innerHTML = result.svg
    el.classList.remove('is-error')
  } else {
    el.textContent = result.error ?? 'Could not render diagram'
    el.classList.add('is-error')
  }
}

function buildDecorations(state: EditorState): DecorationSet {
  const decorations: Decoration[] = []

  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'code_block') return
    if (node.attrs.language !== 'mermaid') return

    const source = node.textContent
    decorations.push(
      Decoration.widget(
        pos + node.nodeSize,
        () => {
          const el = document.createElement('div')
          el.className = 'mermaid-figure'
          el.setAttribute('contenteditable', 'false')
          renderInto(el, source)
          return el
        },
        // Keyed by source so an unchanged diagram keeps its rendered element
        // instead of being torn down and rebuilt on every transaction.
        { key: `mermaid:${pos}:${source}`, side: 1 }
      )
    )
  })

  return DecorationSet.create(state.doc, decorations)
}

const mermaidKey = new PluginKey('ekram-mermaid')

export const mermaidPlugin: MilkdownPlugin[] = [
  $prose(
    () =>
      new Plugin({
        key: mermaidKey,
        state: {
          init: (_config, state) => buildDecorations(state),
          apply: (tr, value, _old, newState) =>
            tr.docChanged ? buildDecorations(newState) : value,
        },
        props: {
          decorations(state) {
            return mermaidKey.getState(state) as DecorationSet | undefined
          },
        },
      })
  ),
] as MilkdownPlugin[]
