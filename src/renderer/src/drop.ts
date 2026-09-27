/**
 * Opening markdown files dropped onto the window.
 *
 * Dropped anywhere — the document, the sidebar, the title bar — a markdown
 * file opens in a tab, as File > Open would. Other files, images among them,
 * are left to the editor, which inserts dropped images into the document.
 *
 * A file dropped from the desktop has a path and is opened from disk, so it
 * saves back where it came from and is watched like any other. A file without
 * one (dragged out of an application that offers no path) opens as a new,
 * unsaved document with its name and its text.
 */
import { OPENABLE } from '../../shared/openable'
import { adoptFile, newDoc } from './stores/documents'
import { reportError } from './utils/report'

function markdownFiles(dt: DataTransfer | null): File[] {
  return [...(dt?.files ?? [])].filter((f) => OPENABLE.test(f.name))
}

async function open(files: File[]): Promise<void> {
  for (const file of files) {
    try {
      const path = window.api.file.pathForFile(file)
      if (path) {
        adoptFile(await window.api.file.read(path))
      } else {
        // Read first: the editor is built from the document's text as soon
        // as the document exists.
        const text = await file.text()
        const doc = newDoc()
        doc.name = file.name
        doc.content = text
      }
    } catch (err) {
      reportError(`open dropped ${file.name}`, err)
    }
  }
}

/** Starts accepting dropped markdown files; returns a function that stops. */
export function installFileDrop(): () => void {
  // Without this the browser refuses a drop anywhere but the editor.
  const onDragOver = (event: DragEvent): void => {
    if ([...(event.dataTransfer?.types ?? [])].includes('Files')) event.preventDefault()
  }
  const onDrop = (event: DragEvent): void => {
    const files = markdownFiles(event.dataTransfer)
    if (files.length === 0) return
    // Claimed before the editor sees it, or it would try to insert the file.
    event.preventDefault()
    event.stopPropagation()
    void open(files)
  }
  window.addEventListener('dragover', onDragOver, true)
  window.addEventListener('drop', onDrop, true)
  return () => {
    window.removeEventListener('dragover', onDragOver, true)
    window.removeEventListener('drop', onDrop, true)
  }
}
