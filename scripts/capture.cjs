/**
 * Screenshots of the views that need a human eye.
 *
 * Tests assert on computed values; they cannot say whether a menu is readable
 * or a theme looks right. This captures those views as images, so they can be
 * looked at — in CI, where the app can run, and downloaded from the run.
 *
 *   node scripts/capture.cjs <outDir>
 *
 * Each shot is independent: one that fails is recorded in errors.txt and the
 * rest still run, so a single broken view does not hide all the others.
 */
/* global document, window -- inside page.evaluate callbacks, which run in the app */
const { _electron } = require('playwright')
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')

const OUT = resolve(process.argv[2] ?? 'artifacts/screens')
mkdirSync(OUT, { recursive: true })
const errors = []

const SAMPLE = [
  '# A document to look at',
  '',
  'A paragraph of ordinary prose, long enough to wrap across the column so that its width and',
  'the size of its text can both be judged by eye. **Bold**, *emphasis*, `inline code` and a',
  '[link](https://example.com).',
  '',
  '> [!NOTE]',
  '> An alert, drawn in the theme’s accent.',
  '',
  '```js',
  'const answer = 42',
  '```',
  '',
  '| Column | Another |',
  '| --- | --- |',
  '| one | two |',
  '',
  '- a list item',
  '- another',
  '',
].join('\n')

async function shot(page, name, prepare) {
  try {
    if (prepare) await prepare()
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(OUT, `${name}.png`) })
    console.log(`captured ${name}`)
  } catch (err) {
    errors.push(`${name}: ${String(err).split('\n')[0]}`)
    console.log(`FAILED ${name}`)
  }
}

;(async () => {
  const env = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (k !== 'ELECTRON_RUN_AS_NODE' && v !== undefined) env[k] = v
  }
  const work = mkdtempSync(join(tmpdir(), 'ekmd-capture-'))
  const file = join(work, 'sample.md')
  writeFileSync(file, SAMPLE, 'utf8')

  const app = await _electron.launch({
    args: ['.', `--user-data-dir=${join(work, 'userdata')}`],
    cwd: process.cwd(),
    env,
  })
  try {
    const page = await app.firstWindow()
    await page.waitForSelector('.app', { timeout: 30_000 })
    // A fixed size, so shots from different runs compare directly.
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      win.unmaximize()
      win.setSize(1400, 900)
    })

    await app.evaluate(({ BrowserWindow }, p) => {
      BrowserWindow.getAllWindows()[0].webContents.send('file:open-path', p)
    }, file)
    await page.waitForFunction(
      () => document.querySelector('.ProseMirror')?.textContent?.includes('A document to look at'),
      null,
      { timeout: 15_000 }
    )

    await shot(page, '01-document')

    await shot(page, '02-block-menu', async () => {
      // The block handle appears beside the paragraph the pointer is over.
      const para = page.locator('.ProseMirror p').first()
      await para.hover()
      await page.waitForSelector('.milkdown-block-handle', { state: 'visible', timeout: 5000 })
      await page.locator('.milkdown-block-handle .operation-item').first().click()
      await page.waitForSelector('.milkdown-slash-menu', { state: 'visible', timeout: 5000 })
    })
    await page.keyboard.press('Escape')

    await shot(page, '03-preferences', async () => {
      await page.keyboard.press('Control+,')
      await page.waitForSelector('.prefs__panel', { state: 'visible', timeout: 5000 })
    })
    await page.keyboard.press('Escape')

    // Every built-in theme, by switching the attribute its stylesheet keys on.
    const ids = await page.evaluate(async () =>
      (await window.api.themes.list()).filter((t) => t.builtin).map((t) => t.id)
    )
    for (const id of ids) {
      await shot(page, `theme-${id}`, async () => {
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), id)
      })
    }
  } finally {
    await app.close().catch(() => {})
    rmSync(work, { recursive: true, force: true })
    if (errors.length > 0) writeFileSync(join(OUT, 'errors.txt'), errors.join('\n') + '\n')
  }
  console.log(
    errors.length ? `\n${errors.length} shot(s) failed; see errors.txt` : '\nall shots captured'
  )
})()
