/**
 * What the page says about updates; main finds, fetches and installs them
 * (main/updates.ts).
 *
 * Each step is a notice with its next step as an action, never a dialog: a
 * newer version is offered while the user keeps working, and nothing more
 * happens unless they choose it. Notices share one key, so each step replaces
 * the last where it stands.
 */
import { notify } from './notifications'
import type { UpdateEvent } from '../../../shared/updates'

const KEY = 'update'

async function download(version: string): Promise<void> {
  notify(`Downloading ekram.md ${version}…`, { key: KEY, timeoutMs: 0 })
  await window.api.updates.download()
}

export function showUpdate(event: UpdateEvent): void {
  switch (event.kind) {
    case 'available':
      notify(`ekram.md ${event.version} is available.`, {
        key: KEY,
        timeoutMs: 0,
        actions: event.installable
          ? [
              { label: 'Download', run: () => download(event.version) },
              { label: 'What’s new', run: () => window.api.updates.openRelease() },
            ]
          : // The portable copy: a new zip to fetch from the release page.
            [{ label: 'Download page', run: () => window.api.updates.openRelease() }],
      })
      break
    case 'ready':
      notify(`ekram.md ${event.version} is ready, and is installed when you quit.`, {
        key: KEY,
        timeoutMs: 0,
        actions: [{ label: 'Restart now', run: () => window.api.updates.restart() }],
      })
      break
    case 'none':
      notify(`ekram.md ${event.version} is the latest version.`, { key: KEY })
      break
    case 'unsupported':
      notify('Updates are checked in the installed app, not in this build.', { key: KEY })
      break
    case 'error':
      notify(event.message, { key: KEY, kind: 'error' })
      break
  }
}

/** Listens for updates, and lets main start its check now that the page has painted. */
export function installUpdates(): () => void {
  const stop = window.api.updates.onEvent(showUpdate)
  requestAnimationFrame(() => requestAnimationFrame(() => window.api.updates.startup()))
  return stop
}
