/**
 * Export and print.
 *
 * The renderer hands over a payload it has already cleaned and sanitized; main
 * owns the save dialog, the filesystem and the offscreen print window. Each
 * handler returns a result object rather than throwing, so a cancelled dialog
 * and a failed write are both something the caller can report rather than an
 * unhandled rejection.
 */
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { writeFileAtomic } from '../fs/textfile'
import { dirname, join } from 'node:path'
import { buildHtml, type ExportPayload } from '../export/html'
import { exportPdf } from '../export/pdf'
import { printHtml } from '../export/print'
import { log } from '../log'
import { mayOpenExport, rememberExport } from '../export/exported'
import { getSettings } from '../settings'

export interface ExportResult {
  ok: boolean
  path?: string
  /** True when the user closed the save dialog; not an error. */
  cancelled?: boolean
  error?: string
}

/** Where to suggest saving: beside the document, or the last-used folder. */
function suggestedPath(payload: ExportPayload, extension: string): string {
  const name = `${payload.title || 'document'}.${extension}`
  return payload.documentPath ? join(dirname(payload.documentPath), name) : name
}

export function registerExportIpc(): void {
  ipcMain.handle('export:html', async (e, payload: ExportPayload): Promise<ExportResult> => {
    const win = BrowserWindow.fromWebContents(e.sender)
    try {
      const r = await dialog.showSaveDialog(win!, {
        title: 'Export HTML',
        defaultPath: suggestedPath(payload, 'html'),
        filters: [{ name: 'HTML', extensions: ['html', 'htm'] }],
      })
      if (r.canceled || !r.filePath) return { ok: false, cancelled: true }

      await writeFileAtomic(r.filePath, await buildHtml(payload))
      rememberExport(r.filePath)
      log.info('exported html', { path: r.filePath })
      return { ok: true, path: r.filePath }
    } catch (err) {
      log.error('html export failed', { err: String(err) })
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('export:pdf', async (e, payload: ExportPayload): Promise<ExportResult> => {
    const win = BrowserWindow.fromWebContents(e.sender)
    try {
      const r = await dialog.showSaveDialog(win!, {
        title: 'Export PDF',
        defaultPath: suggestedPath(payload, 'pdf'),
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      })
      if (r.canceled || !r.filePath) return { ok: false, cancelled: true }

      // As chosen in the page setup just before, which stores it.
      await exportPdf(await buildHtml(payload), r.filePath, { setup: getSettings().pdf })
      rememberExport(r.filePath)
      return { ok: true, path: r.filePath }
    } catch (err) {
      log.error('pdf export failed', { err: String(err) })
      return { ok: false, error: String(err) }
    }
  })

  /**
   * Opens an export in its program, from the message saying where it went.
   * Only a file this session exported: see `export/exported.ts`.
   */
  ipcMain.handle('export:open', async (_e, path: string): Promise<string> => {
    if (!mayOpenExport(path)) return 'Only a file exported in this session can be opened from here.'
    return shell.openPath(path)
  })

  /**
   * Print, through the system print dialog: see export/print.ts.
   *
   * The export's HTML, in a window of its own, rather than the editor's own
   * window: printing that would print the sidebar, the tab bar and the caret
   * along with the document.
   */
  ipcMain.handle('export:print', async (e, payload: ExportPayload): Promise<ExportResult> => {
    try {
      const html = await buildHtml(payload)
      const r = await printHtml(BrowserWindow.fromWebContents(e.sender), html, getSettings().pdf)
      if (r.ok) log.info('printed', { title: payload.title })
      return r
    } catch (err) {
      log.error('print failed', { err: String(err) })
      return { ok: false, error: String(err) }
    }
  })
}
