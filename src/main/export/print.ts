/**
 * Printing, through the system's own print dialog.
 *
 * Print used to render a PDF and open it in whatever program shows PDFs, to
 * be printed from there. The document is now laid out in a hidden window owned
 * by the user's, the print dialog asks where and how, and the window goes. The
 * page setup chosen for PDFs is where the dialog starts.
 */
import { BrowserWindow } from 'electron'
import { MARGINS, validPageSetup, type PageSetup } from '../../shared/page-setup'
import { log } from '../log'

export type PrintResult = { ok: true } | { ok: false; cancelled?: boolean; error?: string }

const PX_PER_INCH = 96

export async function printHtml(
  parent: BrowserWindow | null,
  html: string,
  raw: Partial<PageSetup> | undefined
): Promise<PrintResult> {
  const setup = validPageSetup(raw)
  const win = new BrowserWindow({
    show: false,
    // Owned by the user's window, so the dialog comes up over it.
    parent: parent ?? undefined,
    webPreferences: {
      // The same shut-in page as the PDF export: nothing in it runs or reaches out.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      javascript: false,
    },
  })
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    // Fonts and layout settle a frame after load, as for the PDF export.
    await new Promise((resolve) => setTimeout(resolve, 250))
    const margin = Math.round(MARGINS[setup.margin] * PX_PER_INCH)
    return await new Promise<PrintResult>((resolve) => {
      win.webContents.print(
        {
          silent: false,
          printBackground: true,
          pageSize: setup.pageSize,
          landscape: setup.landscape,
          margins: {
            marginType: 'custom',
            top: margin,
            bottom: margin,
            left: margin,
            right: margin,
          },
        },
        (success, failure) => {
          if (success) resolve({ ok: true })
          else if (/cancel/i.test(failure)) resolve({ ok: false, cancelled: true })
          else resolve({ ok: false, error: failure || 'The document could not be printed.' })
        }
      )
    })
  } catch (err) {
    log.error('print failed', { err: String(err) })
    return { ok: false, error: String(err) }
  } finally {
    win.destroy()
  }
}
