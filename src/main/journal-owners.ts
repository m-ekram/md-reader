/**
 * Which page wrote each crash journal.
 *
 * Recovery is offered as a window starts. Without knowing who wrote what, a
 * second window was offered the first window's live, unsaved work as
 * "recovered" — and Discard deleted its only protection against a crash. A
 * journal is now offered to a window only when no live page owns it, or when
 * the window asking is its owner: that is the crash case, where the same
 * window reloads and must get its work back.
 *
 * Keyed by the journal's path (a file path, or `untitled:` plus a document id),
 * owned by the page's webContents id, which survives a reload.
 */
const owners = new Map<string, number>()

export function noteOwner(path: string, ownerId: number): void {
  owners.set(path, ownerId)
}

export function forgetOwner(path: string): void {
  owners.delete(path)
}

/** A page is gone: what it journalled is anyone's to recover now. */
export function forgetPage(ownerId: number): void {
  for (const [path, id] of owners) if (id === ownerId) owners.delete(path)
}

/** The journals a page may be offered. */
export function recoverableFor<T extends { path: string }>(
  entries: T[],
  askerId: number,
  isLive: (id: number) => boolean
): T[] {
  return entries.filter((e) => {
    const owner = owners.get(e.path)
    return owner === undefined || owner === askerId || !isLive(owner)
  })
}
