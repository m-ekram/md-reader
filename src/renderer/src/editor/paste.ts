/**
 * Image paste and drop.
 *
 * Images arriving on the clipboard or by drag-and-drop are written into the
 * document's assets folder and linked relatively. Without this they would be
 * embedded as base64 blobs — unreadable as markdown and enormous on disk — or
 * dropped entirely.
 *
 * Implemented as a capture-phase DOM listener rather than a ProseMirror
 * `handlePaste` prop. The editor's own image feature registers its paste
 * handling first, and ProseMirror stops at the first plugin that claims the
 * event, so a plugin added afterwards never runs at all. Capture phase gets
 * there before any of them.
 */
import type { EditorView } from '@milkdown/kit/prose/view'
import { Selection } from '@milkdown/kit/prose/state'
import { activeDoc } from '../stores/documents'
import { useSettingsStore } from '../stores/settings'

const settings = useSettingsStore()

function imageFilesFrom(data: DataTransfer | null | undefined): File[] {
  if (!data) return []
  return [...data.files].filter((f) => f.type.startsWith('image/'))
}

/**
 * Writes one image and inserts a link at the current selection.
 *
 * Returns false when it could not be handled, so a batch stops rather than
 * reporting the same failure once per file.
 */
async function insertImage(view: EditorView, file: File): Promise<boolean> {
  const doc = activeDoc.value
  if (!doc) return false

  const buffer = new Uint8Array(await file.arrayBuffer())
  const result = await window.api.images.save({
    documentPath: doc.path,
    assetsFolder: settings.value.editor.assetsFolder,
    suggestedName: file.name || undefined,
    data: buffer,
    mimeType: file.type,
  })

  if (!result.ok || !result.relativePath) {
    // Most often: the document has never been saved, so there is no folder for
    // the link to be relative to. Say so rather than failing silently.
    await window.api.app.info('Could not add image', result.error ?? 'Unknown error')
    return false
  }

  const alt = file.name ? file.name.replace(/\.[^.]+$/, '') : 'image'
  const { state, dispatch } = view
  const imageType = state.schema.nodes['image']

  if (imageType) {
    dispatch(
      state.tr.replaceSelectionWith(imageType.create({ src: result.relativePath, alt }), false)
    )
  } else {
    dispatch(state.tr.insertText(`![${alt}](${result.relativePath})`))
  }
  return true
}

async function insertAll(view: EditorView, files: File[]): Promise<void> {
  try {
    for (const file of files) {
      if (!(await insertImage(view, file))) return
    }
  } catch (err) {
    // The event was already claimed, so without this the image would simply
    // vanish and the failure would surface only as an unhandled rejection.
    await window.api.app.info('Could not add image', String(err))
  }
}

/**
 * Attaches the handlers to an editor's root element.
 *
 * Returns a cleanup function: the pool keeps editors alive, so listeners must
 * come off when one is finally destroyed.
 */
export function attachImageHandlers(
  root: HTMLElement,
  getView: () => EditorView | null
): () => void {
  const onPaste = (event: ClipboardEvent): void => {
    const files = imageFilesFrom(event.clipboardData)
    if (files.length === 0) return
    const view = getView()
    if (!view) return

    // Claimed here so the editor's own handler does not also insert a copy.
    event.preventDefault()
    event.stopPropagation()
    void insertAll(view, files)
  }

  const onDrop = (event: DragEvent): void => {
    const files = imageFilesFrom(event.dataTransfer)
    if (files.length === 0) return
    const view = getView()
    if (!view) return

    event.preventDefault()
    event.stopPropagation()

    // Insert where it was dropped, not wherever the caret happened to be.
    const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })
    if (pos) {
      view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(pos.pos))))
    }
    void insertAll(view, files)
  }

  root.addEventListener('paste', onPaste, true)
  root.addEventListener('drop', onDrop, true)

  return () => {
    root.removeEventListener('paste', onPaste, true)
    root.removeEventListener('drop', onDrop, true)
  }
}
