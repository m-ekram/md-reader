import { beforeEach, describe, expect, it } from 'vitest'
import { filterSettings } from './settings-filter'

let root: HTMLElement

beforeEach(() => {
  root = document.createElement('div')
  root.innerHTML = `
    <section class="prefs__section">
      <h3>Appearance</h3>
      <label class="row"><span>Theme</span><select><option>Nord</option><option>Sepia</option></select></label>
      <div class="row"><span>Text size</span><input aria-label="Text size in pixels"></div>
      <p class="hint">View ▸ Zoom changes it too.</p>
    </section>
    <section class="prefs__section">
      <h3>Files</h3>
      <label class="row"><input type="checkbox"><span>Save automatically</span></label>
      <p class="hint">Saved a moment after you stop typing.</p>
    </section>`
})

const shown = () =>
  [...root.querySelectorAll<HTMLElement>('.row, .hint, .prefs__section')]
    .filter((el) => !el.hidden && !el.closest('[hidden]'))
    .map((el) =>
      el.matches('.prefs__section')
        ? `§${el.querySelector('h3')!.textContent}`
        : el.textContent!.trim()
    )

describe('filterSettings', () => {
  it('shows every row and note with nothing typed', () => {
    expect(filterSettings(root, '')).toBe(3)
    expect(shown()).toHaveLength(2 + 3 + 2)
  })

  it('keeps the rows that mention what is typed, ignoring case, and their sections', () => {
    expect(filterSettings(root, 'SAVE')).toBe(1)
    expect(shown()).toEqual(['§Files', 'Save automatically'])
  })

  it('finds a row by a choice in it', () => {
    filterSettings(root, 'sepia')
    expect(shown()).toEqual(['§Appearance', 'ThemeNordSepia'])
  })

  it('shows a whole section when its heading matches, notes included', () => {
    expect(filterSettings(root, 'appear')).toBe(2)
    expect(shown()).toContain('View ▸ Zoom changes it too.')
    expect(shown()).not.toContain('§Files')
  })

  it('counts nothing when nothing matches, and shows it all again when cleared', () => {
    expect(filterSettings(root, 'zzz')).toBe(0)
    expect(shown()).toEqual([])
    filterSettings(root, '')
    expect(shown()).toHaveLength(7)
  })
})
