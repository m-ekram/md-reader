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
import { MARGINS, validPageSetup, type PageSetup } from '../../shared/page-setup'

export interface PdfOptions {
  /** Paper, orientation, margins and page numbers; checked here, whatever sent it. */
  setup?: Partial<PageSetup>
  printBackground?: boolean
}

/** "3 / 12", small and centred at the foot of the page. */
const PAGE_NUMBER_FOOTER =
  '<div style="width:100%;font-size:8pt;color:#777;text-align:center;font-family:sans-serif">' +
  '<span class="pageNumber"></span> / <span class="totalPages"></span></div>'

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

    const setup = validPageSetup(opts.setup)
    // Explicit inches rather than Electron's ~0.4 in default, so the number is
    // the same on every platform.
    const m = MARGINS[setup.margin]
    return await win.webContents.printToPDF({
      pageSize: setup.pageSize,
      landscape: setup.landscape,
      printBackground: opts.printBackground ?? true,
      // Room at the foot for the page number, whatever the margin.
      margins: { top: m, bottom: setup.pageNumbers ? Math.max(m, 0.6) : m, left: m, right: m },
      displayHeaderFooter: setup.pageNumbers,
      headerTemplate: '<div></div>',
      footerTemplate: setup.pageNumbers ? PAGE_NUMBER_FOOTER : '<div></div>',
      preferCSSPageSize: false,
    })
  } finally {
    win.destroy()
  }
}

export async function exportPdf(
  html: string,
  targetPath: string,
  opts?: PdfOptions
): Promise<void> {
  const bytes = await renderPdf(html, opts)
  await writeFileAtomic(targetPath, bytes)
  log.info('exported pdf', { targetPath, bytes: bytes.byteLength })
}
