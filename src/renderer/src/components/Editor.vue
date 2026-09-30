<script setup lang="ts">
/**
 * The editing surface.
 *
 * A host, not an owner: WYSIWYG editors live in the pool so switching tabs does
 * not throw away undo history. The host shows the active document's editor, or
 * a CodeMirror view when that document is in source mode, and runs the
 * round-trip guard the first time a document is opened.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { acquire, editorFor, release, releaseAll } from '../editor/pool'
import type { SourceHandle } from '../editor/sourceMode'
import { checkRoundTrip } from '../editor/roundtrip'
import {
  activeDoc,
  focusWanted,
  journalKey,
  takeEditorFocus,
  useDocuments,
  type Doc,
} from '../stores/documents'
import { editorViewCtx } from '@milkdown/kit/core'
import { isDarkTheme } from '../utils/dark'
import { clearShownSource, setShownSource } from '../editor/source-registry'
import { invalidateCommands } from '../commands/registry'
import { started } from '../stores/session'
import { reportCaret } from '../stores/caret'
import { followWikiLink } from '../stores/wiki'
import { wikiSuggestHooks } from '../stores/wiki-suggest'
import Welcome from './Welcome.vue'

const host = ref<HTMLElement | null>(null)
const docs = useDocuments()

/**
 * Showing is async, so two quick switches can interleave. Every attempt takes a
 * ticket and abandons its work if a newer one started while it was awaiting.
 */
let showToken = 0
let source: SourceHandle | null = null

/** The reload each pooled editor was built from, by document id. */
const builtAt = new Map<string, number>()

function teardownSource(): void {
  clearShownSource(source)
  source?.destroy()
  source = null
  invalidateCommands()
}

/**
 * Imported on first use, as mermaid is.
 *
 * CodeMirror is a large dependency and most sessions never leave WYSIWYG, so
 * a static import made everyone carry it for nothing. Measured over five
 * launches: 311 kB off the startup bundle and ~5 MB off idle RSS. Cold start
 * did not move, so the cost was memory rather than time.
 */
async function showSource(doc: Doc, token: number): Promise<void> {
  if (!host.value) return
  const { createSourceEditor } = await import('../editor/sourceMode')
  // The import is a suspension point, so the document may have changed under
  // it; the ticket says whether this attempt is still the current one.
  if (token !== showToken || !host.value) return

  const container = document.createElement('div')
  container.className = 'source-host'
  host.value.replaceChildren(container)

  source = createSourceEditor({
    root: container,
    value: doc.content,
    dark: isDarkTheme(),
    readonly: doc.readonly,
    onChange: (text) => {
      const target = docs.docs.find((d) => d.id === doc.id)
      if (!target) return
      target.content = text
      window.api.file.journal(journalKey(target), text)
    },
    onCaret: (line) => reportCaret(doc.id, 'line', line),
  })
  // Find and the other commands reach it through the registry, by document.
  setShownSource(doc.id, source)
  invalidateCommands()
  shownId = doc.id
  // It always takes the focus, so a request for it is met.
  takeEditorFocus(doc.id)
  source.view.focus()
}

/** Warns before editing when the file cannot be written back faithfully. */
function runGuard(doc: Doc, reserialize: (md: string) => string): void {
  if (doc.lossy !== null) return
  try {
    const report = checkRoundTrip(doc.savedContent, reserialize(doc.savedContent))
    doc.lossy = report.lossy ? { lossy: true, note: report.note } : { lossy: false, note: '' }
  } catch {
    doc.lossy = { lossy: true, note: 'This file could not be parsed cleanly.' }
  }
}

async function show(): Promise<void> {
  const token = ++showToken
  const doc = activeDoc.value
  if (!host.value) return

  shownId = ''
  teardownSource()

  if (!doc) {
    host.value.replaceChildren()
    return
  }

  if (doc.sourceMode) {
    await showSource(doc, token)
    return
  }

  // A pooled editor built before the document was reloaded shows the old
  // text: rebuilt. Checked here, on every show, and not only when the active
  // document reloads, because a document can be reloaded in the background.
  // Crash recovery does that: the last session reopens a file, and then its
  // recovered text replaces what was read from disk.
  const builtFor = doc.reloadToken
  if ((builtAt.get(doc.id) ?? builtFor) !== builtFor) {
    await release(doc.id)
    if (token !== showToken) return
  }

  const pooled = await acquire({
    id: doc.id,
    getContent: () => doc.content,
    // Looked up each time: Save As changes it.
    documentPath: () => docs.docs.find((d) => d.id === doc.id)?.path ?? null,
    onChange: (markdown) => {
      // Route by the id this editor was built for, not the active document: a
      // pooled editor can emit after focus has already moved elsewhere.
      const target = docs.docs.find((d) => d.id === doc.id)
      if (!target || target.sourceMode) return
      target.content = markdown
      window.api.file.journal(journalKey(target), markdown)
    },
    onCaret: (index) => reportCaret(doc.id, 'heading', index),
    onWikiLink: (link) => void followWikiLink(link, doc.id),
    wikiSuggest: wikiSuggestHooks(
      doc.id,
      () => docs.docs.find((d) => d.id === doc.id)?.path ?? null
    ),
  })
  builtAt.set(doc.id, builtFor)

  if (token !== showToken || !host.value) return

  // Adopting the element rather than re-rendering is what preserves the editor
  // state, including its undo stack and cursor position.
  if (host.value.firstChild !== pooled.el) host.value.replaceChildren(pooled.el)
  // Re-applied on every show: a pooled editor keeps its own state, so a
  // document marked readonly would come back editable after a tab switch.
  pooled.handle.setReadonly(doc.readonly)
  runGuard(doc, pooled.handle.reserialize)
  shownId = doc.id
  // Opened to be worked on: ready to type in. See requestEditorFocus.
  if (takeEditorFocus(doc.id)) focusShown()
}

/** The document on screen, once its view is up; '' while one is being built. */
let shownId = ''

function focusShown(): void {
  if (source) source.view.focus()
  else editorFor(shownId)?.crepe.editor.action((ctx) => ctx.get(editorViewCtx).focus())
}

// A file opened again while it is already in front shows nothing new.
watch(focusWanted, (id) => {
  if (id && id === shownId && takeEditorFocus(id)) focusShown()
})

onMounted(show)
onBeforeUnmount(() => {
  teardownSource()
  void releaseAll()
})

/**
 * Keyed on document identity and mode, not path.
 *
 * Save As changes the path but is the same document, and reacting there would
 * swap the editor out underneath the user at the moment they expect nothing to
 * happen. Leaving source mode releases the pooled editor so it is rebuilt from
 * the text that was just edited, rather than showing stale content.
 */
watch(
  () => (activeDoc.value ? `${activeDoc.value.id}:${activeDoc.value.sourceMode}` : ''),
  async (next, prev) => {
    const [id, mode] = next.split(':')
    const [prevId, prevMode] = (prev ?? '').split(':')
    if (id && id === prevId && mode !== prevMode && mode === 'false') await release(id)
    await show()
  }
)

// A reload replaces the document's content wholesale. A pooled editor holds its
// own state and will not pick that up, so show() rebuilds it.
watch(
  () => (activeDoc.value ? `${activeDoc.value.id}:${activeDoc.value.reloadToken}` : ''),
  async (next, prev) => {
    if (!next || !prev) return
    const [id, token] = next.split(':')
    const [prevId, prevToken] = prev.split(':')
    if (id !== prevId || token === prevToken) return
    await show()
  }
)
</script>

<template>
  <div class="editor-scroll" :class="{ 'is-source': activeDoc?.sourceMode }">
    <Welcome v-if="!activeDoc && started" />
    <div v-show="activeDoc" ref="host" class="editor-host" />
  </div>
</template>

<style scoped>
.editor-scroll {
  flex: 1;
  overflow: auto;
  background: var(--doc-bg);
  color: var(--doc-fg);
}
.editor-host {
  /* The measure is the text's width; the gutters either side are extra.
     Full width sets the measure to none, which makes this invalid, and an
     invalid max-width is no maximum: the column fills the pane. */
  max-width: calc(var(--doc-measure) + 2 * var(--doc-gutter));
  margin: 0 auto;
  padding: 40px 32px 55vh;
}
/*
 * Source mode fills the pane: line numbers and code want the full width, and
 * CodeMirror does its own virtualised scrolling.
 */
.editor-scroll.is-source {
  overflow: hidden;
}
.editor-scroll.is-source .editor-host {
  max-width: none;
  margin: 0;
  padding: 0;
  height: 100%;
}
</style>
