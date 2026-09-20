// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { useApp } from './helpers'

/**
 * The application shell: window chrome, status bar, and a usable document on launch.
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()
describe('application shell', () => {
  it('starts without console errors', () => {
    expect(ctx.consoleErrors).toEqual([])
  })

  it('renders the title bar and status bar', async () => {
    await expect(ctx.page.locator('.titlebar')).toBeTruthy()
    expect(await ctx.page.locator('.titlebar').count()).toBe(1)
    expect(await ctx.page.locator('.status').count()).toBe(1)
  })

  it('starts with an editable document', async () => {
    expect(await ctx.page.locator('.ProseMirror').count()).toBe(1)
  })
})
