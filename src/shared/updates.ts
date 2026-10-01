/** What main tells the page about updates; see main/updates.ts. */
export type UpdateEvent =
  /** A newer version; `installable` is false for the portable zip, which cannot install it. */
  | { kind: 'available'; version: string; installable: boolean }
  /** Downloaded, and installed when the app next quits. */
  | { kind: 'ready'; version: string }
  /** The check found nothing newer. Only answered to a check the user asked for. */
  | { kind: 'none'; version: string }
  /** Not this build: development, or a test run. */
  | { kind: 'unsupported' }
  | { kind: 'error'; message: string }
