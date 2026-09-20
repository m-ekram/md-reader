/**
 * Export and print.
 *
 * Each of these renders the document as it currently appears, so they are
 * disabled without one open. The work splits across the process boundary: the
 * renderer collects and sanitizes, main writes the file, and the result comes
 * back as a value rather than an exception so a cancelled save dialog and a
 * failed write can be told apart.
 */
import { activeDoc } from '../stores/documents'
import { collectExport } from '../export/payload'
import { showNotice } from '../stores/ui'
import { registerAll, type Command } from './registry'

const hasDocument = (): boolean => activeDoc.value !== null

type Exporter = (payload: Awaited<ReturnType<typeof collectExport>> & object) => Promise<{
  ok: boolean
  path?: string
  cancelled?: boolean
  error?: string
}>

/**
 * Collects, hands off, and reports.
 *
 * `verb` is used in the message, so the user is told which of three similar
 * actions succeeded or failed rather than a generic "done".
 */
async function runExport(verb: string, exporter: Exporter): Promise<void> {
  const payload = await collectExport()
  if (!payload) {
    showNotice('Nothing to export.', 'error')
    return
  }

  showNotice(`${verb}…`)
  const result = await exporter(payload)

  // A cancelled dialog is the user changing their mind, not a failure worth
  // reporting back to them.
  if (result.cancelled) {
    showNotice('')
    return
  }
  if (!result.ok) {
    showNotice(`${verb} failed: ${result.error ?? 'unknown error'}`, 'error')
    return
  }
  showNotice(`${verb} complete — ${result.path}`)
}

const exportCommands: Command[] = [
  {
    id: 'file.exportHtml',
    enabled: hasDocument,
    run: () => runExport('Export HTML', (p) => window.api.export.html(p)),
  },
  {
    id: 'file.exportPdf',
    enabled: hasDocument,
    run: () => runExport('Export PDF', (p) => window.api.export.pdf(p)),
  },
  {
    id: 'file.print',
    enabled: hasDocument,
    // Printing goes through the same render as PDF and opens the result in the
    // system viewer, which is where the print dialog lives.
    run: () => runExport('Print', (p) => window.api.export.print(p)),
  },
]

export function registerExportCommands(): void {
  registerAll(exportCommands)
}
