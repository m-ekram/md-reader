// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chooseMenu, newDocument, useApp, waitForText } from './helpers'

/**
 * What the app sends over the network on its own: nothing, which is what the
 * README's privacy statement says. Every request the session makes is recorded
 * while a document is written, checked for spelling, and the app looked around.
 * (The update check is off in tests; it is the one exception the README names.)
 *
 * Own application instance and temp directory, per helpers.ts.
 */
const ctx = useApp()

/** Requests that leave the machine; the app's own files and inline data do not. */
const LOCAL = /^(file|data|blob|devtools|chrome|chrome-extension):/

describe('privacy', () => {
  it('sends nothing over the network while a document is written and spell-checked', async () => {
    await ctx.app.evaluate(({ session }, local) => {
      const g = globalThis as unknown as { __requests: string[] }
      g.__requests = []
      const pattern = new RegExp(local)
      session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        if (!pattern.test(details.url)) g.__requests.push(details.url)
        callback({})
      })
    }, LOCAL.source)

    await newDocument(ctx)
    await ctx.page.keyboard.type('Teh quick brwon fox jumsp over the lazzy dog.')
    await waitForText(ctx, 'lazzy dog')
    await ctx.page.keyboard.press('Control+,')
    await ctx.page.keyboard.press('Escape')
    await chooseMenu(ctx, 'Help', 'Quick Start')
    await waitForText(ctx, 'Quick Start')
    // A duration: this waits for something not to happen. The spell checker
    // starts on its own schedule, and would ask for a dictionary within it.
    await ctx.page.waitForTimeout(5000)

    const requests = await ctx.app.evaluate(
      () => (globalThis as unknown as { __requests: string[] }).__requests
    )
    const log = await readFile(join(ctx.workdir, 'userdata', 'logs', 'main.log'), 'utf8').catch(
      () => ''
    )
    const dictionaries = log.split('\n').filter((l) => l.includes('downloading a dictionary'))

    if (process.platform === 'win32') {
      // Windows checks spelling itself: no dictionary, and no request at all.
      expect(dictionaries).toEqual([])
      expect(requests).toEqual([])
    } else {
      // Elsewhere Chromium fetches a Hunspell dictionary; that is all.
      expect(requests.filter((u) => !/\.bdic(\?|$)/.test(u))).toEqual([])
    }
  })
})
