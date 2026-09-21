/**
 * PDF export, via Chromium's own printing.
 *
 * The HTML export is the input, so PDF and HTML cannot drift apart: whatever
 * makes one correct makes the other correct, and both are styled by the theme
 * file the application itself loads.
 *
 * Rendering happens in an offscreen window rather than the user's own, because
 * printing resizes the viewport and would otherwise reflow the document they
 * are editing.
 */
import { BrowserWindow } from 'electron'
import { writeFileAtomic } from '../fs/textfile'
import { log } from './../log'

export interface PdfOptions {
  /** Paper size as Electron names it. */
  pageSize?: 'A4' | 'Letter' | 'Legal' | 'Tabloid' | 'A3'
  landscape?: boolean
  printBackground?: boolean
}

/**
 * Renders HTML to PDF bytes.
 *
 * The window is created hidden and always destroyed, including on failure — a
 * leaked offscreen window would keep the whole application alive after the last
 * visible window closed.
 */
export async function renderPdf(html: string, opts: PdfOptions = {}): Promise<Buffer> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      // Nothing in an exported document should be able to reach the app or the
      // filesystem: the images are already inlined by the time it gets here.
      offscreen: true,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      javascript: false,
    },
  })

  try {
    // A data URL rather than a temp file: no cleanup, and nothing on disk that
    // could be read by anything else while the export is in flight.
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

    // Fonts and layout settle a frame after load; printing too early can catch
    // the document before webfonts have been applied.
    await new Promise((resolve) => setTimeout(resolve, 250))

    return await win.webContents.printToPDF({
      pageSize: opts.pageSize ?? 'A4',
      landscape: opts.landscape ?? false,
      printBackground: opts.printBackground ?? true,
      // Explicit inches rather than Electron's ~0.4 in default: prose at this
      // measure reads better with a wider margin, and the number is then the
      // same on every platform.
      margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 },
      preferCSSPageSize: false,
    })
  } finally {
    win.destroy()
  }
}

export async function exportPdf(html: string, targetPath: string, opts?: PdfOptions): Promise<void> {
  const bytes = await renderPdf(html, opts)
  await writeFileAtomic(targetPath, bytes)
  log.info('exported pdf', { targetPath, bytes: bytes.byteLength })
}
