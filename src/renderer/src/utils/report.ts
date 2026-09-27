/**
 * Reporting failures instead of swallowing them.
 *
 * Commands ran unguarded, and the page had no handler for errors nothing else
 * caught, so a failure did nothing visible: choosing a recent file that had
 * been deleted simply did nothing, and nothing reached the log either.
 */
import { showNotice } from '../stores/ui'

/** An error as a person should read it, without the IPC wrapping. */
export function describeError(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  return text.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/** Into main.log, where main-process errors already go. */
export function logError(context: string, err: unknown): void {
  const detail = err instanceof Error ? (err.stack ?? err.message) : String(err)
  try {
    window.api.app.logError(`${context}: ${detail}`.slice(0, 4000))
  } catch {
    // Logging must never be what fails.
  }
}

/** A failed action the user took: told on screen, and logged. */
export function reportError(context: string, err: unknown): void {
  showNotice(describeError(err), 'error')
  logError(context, err)
}
