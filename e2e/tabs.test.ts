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

  it('moves a tab when it is dragged along the strip', async () => {
    // Tabs stayed in the order they were opened in.
    while ((await names()).length < 3) await newDocument(ctx)
    const before = await names()
    const box = async (name: string) => (await tab(name).boundingBox())!

    const from = await box(before[0])
    const to = await box(before[2])
    await ctx.page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await ctx.page.mouse.down()
    for (let s = 1; s <= 10; s++) {
      const x =
        from.x + from.width / 2 + ((to.x + to.width / 2 - (from.x + from.width / 2)) * s) / 10
      await ctx.page.mouse.move(x, from.y + from.height / 2)
    }
    await ctx.page.mouse.up()

    await expect.poll(names).toEqual([before[1], before[2], before[0], ...before.slice(3)])
    // A click that does not move is still a click.
    await tab(before[1]).click()
    expect(await ctx.page.title()).toContain(before[1])
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
