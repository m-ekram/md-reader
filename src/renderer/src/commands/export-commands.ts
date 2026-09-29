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
// Only the type: the module itself is loaded on first export. It carries
// DOMPurify and every theme's stylesheet as a string, none of which a launch
// needs.
import type { collectExport } from '../export/payload'
import { showNotice } from '../stores/ui'
import { dismiss, notify } from '../stores/notifications'
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
async function runExport(
  verb: string,
  exporter: Exporter,
  opts: { offerOpen: boolean }
): Promise<void> {
  const { collectExport } = await import('../export/payload')
  const payload = await collectExport()
  if (!payload) {
    showNotice('Nothing to export.', 'error')
    return
  }

  // One message, replaced as the export goes on.
  const progress = notify(`${verb}…`, { key: 'export', timeoutMs: 0 })
  const result = await exporter(payload)

  // A cancelled dialog is the user changing their mind, not a failure worth
  // reporting back to them.
  if (result.cancelled) {
    dismiss(progress)
    return
  }
  if (!result.ok) {
    notify(`${verb} failed: ${result.error ?? 'unknown error'}`, { kind: 'error', key: 'export' })
    return
  }
  const path = result.path!
  // The next thing wanted after an export is usually to look at it.
  const actions = opts.offerOpen
    ? [
        { label: 'Open', run: () => openExport(path) },
        { label: 'Show in Folder', run: () => window.api.file.showInFolder(path) },
      ]
    : []
  notify(`${verb} complete — ${path}`, { key: 'export', actions })
}

async function openExport(path: string): Promise<void> {
  const error = await window.api.export.open(path)
  if (error) showNotice(`Could not open ${path}: ${error}`, 'error')
}

const exportCommands: Command[] = [
  {
    id: 'file.exportHtml',
    enabled: hasDocument,
    run: () => runExport('Export HTML', (p) => window.api.export.html(p), { offerOpen: true }),
  },
  {
    id: 'file.exportPdf',
    enabled: hasDocument,
    run: () => runExport('Export PDF', (p) => window.api.export.pdf(p), { offerOpen: true }),
  },
  {
    id: 'file.print',
    enabled: hasDocument,
    // Printing goes through the same render as PDF and opens the result in the
    // system viewer, which is where the print dialog lives.
    // It is open already.
    run: () => runExport('Print', (p) => window.api.export.print(p), { offerOpen: false }),
  },
]

export function registerExportCommands(): void {
  registerAll(exportCommands)
}
