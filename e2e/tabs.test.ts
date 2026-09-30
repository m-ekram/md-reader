// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { newDocument, useApp, waitForText } from './helpers'

/**
 * The tabs' right-click menu.
 *
 * Its own app: what the menu closes depends on every tab open, and a shared
 * suite leaves dozens behind, some with unsaved text.
 */
const ctx = useApp()

const names = () => ctx.page.locator('.tab__name').allInnerTexts()

/** A tab by its exact name: "Untitled" is a prefix of "Untitled 12". */
const tab = (name: string) =>
  ctx.page.locator('.tab__select').filter({
    has: ctx.page.locator('.tab__name', { hasText: new RegExp(`^${name}$`) }),
  })

async function onTab(name: string, item: string): Promise<void> {
  await tab(name).click({ button: 'right' })
  await ctx.page.locator('.context-menu [role="menuitem"]', { hasText: item }).click()
}

describe('the tabs’ right-click menu', () => {
  it('closes others, those to the right, and the saved, stopping at Cancel', async () => {
    // Tabs could be closed one at a time, by their × or Ctrl+W.
    for (let i = 0; i < 4; i++) await newDocument(ctx)
    const before = await names()
    expect(before.length).toBe(5)
    const third = before[2]

    await onTab(third, 'Close to the Right')
    await expect.poll(names).toEqual(before.slice(0, 3))

    // One with unsaved work, and Cancel when asked about it: it stays, and so
    // does the tab the command had not reached after it.
    await tab(third).click()
    await ctx.page.locator('.ProseMirror').click()
    await ctx.page.keyboard.type('Unsaved.')
    await waitForText(ctx, 'Unsaved.')
    await ctx.app.evaluate(({ dialog }) => {
      dialog.showMessageBox = (async () => ({
        response: 2,
        checkboxChecked: false,
      })) as unknown as typeof dialog.showMessageBox
    })
    await onTab(before[1], 'Close Others')
    // The first closed; the third was asked about, and Cancel kept it.
    await expect.poll(names).toEqual([before[1], third])

    await onTab(before[1], 'Close Saved')
    // One document left, so the tab strip goes; the title names it.
    await expect.poll(names).toEqual([])
    expect(await ctx.page.title()).toContain(third)
  })

  it('copies a tab’s path, or says it has none', async () => {
    await newDocument(ctx)
    await tab((await names())[0]).click({ button: 'right' })
    const copy = ctx.page.locator('.context-menu [role="menuitem"]', { hasText: 'Copy Path' })
    // An Untitled document has no path.
    expect(await copy.isDisabled()).toBe(true)
    await ctx.page.keyboard.press('Escape')
  })
})
