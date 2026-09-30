/**
 * Narrowing Preferences to the settings that mention what was typed.
 *
 * Worked on the dialog as rendered, not on a list of its settings: a second
 * description of every row would drift from the rows. A row matches on its
 * text, the choices in it included, so "sepia" finds Theme. A section whose
 * heading matches shows whole; a section with nothing left hides, and a note
 * shows only beside rows that do.
 */
export function filterSettings(root: HTMLElement, query: string): number {
  const q = query.trim().toLowerCase()
  let matched = 0
  for (const section of root.querySelectorAll<HTMLElement>('.prefs__section')) {
    const heading = section.querySelector('h3')?.textContent?.toLowerCase() ?? ''
    const whole = !q || heading.includes(q)
    let any = false
    for (const row of section.querySelectorAll<HTMLElement>('.row')) {
      const text = [row.textContent ?? '', ...labelsIn(row)].join(' ').toLowerCase()
      const show = whole || text.includes(q)
      row.hidden = !show
      if (show) {
        any = true
        matched++
      }
    }
    for (const hint of section.querySelectorAll<HTMLElement>('.hint')) hint.hidden = !whole
    section.hidden = !any
  }
  return matched
}

/** What the row's controls are called, for fields with no visible label. */
function labelsIn(row: HTMLElement): string[] {
  return [...row.querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label') ?? '')
}
