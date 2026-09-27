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
 *
 * Alongside the shots it writes measurements.json: the computed values behind
 * each visible change (chrome heights, text size, column width, colours), so a
 * picture can be checked against a number.
 */
/* global document, window, getComputedStyle -- inside page.evaluate callbacks, which run in the app */
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
  '> A plain quote, which carries one bar: the theme’s.',
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

/**
 * Measured values, written to measurements.json beside the shots.
 *
 * A picture says a menu looks readable; a number says its background is half
 * transparent. The report rests on these, and a group that fails is recorded
 * in errors.txt rather than left out silently — a missing key means the probe
 * broke, not that the feature works.
 */
const measurements = {}

async function measure(name, probe) {
  try {
    measurements[name] = await probe()
    console.log(`measured ${name}`)
  } catch (err) {
    errors.push(`measure ${name}: ${String(err).split('\n')[0]}`)
    console.log(`FAILED measure ${name}`)
  }
}

/** The title, tab and status bar heights, in px. Runs in the page. */
function chromeHeights() {
  const h = (sel) => {
    const el = document.querySelector(sel)
    return el ? el.getBoundingClientRect().height : null
  }
  return { titlebar: h('.titlebar'), tabs: h('.tabs'), status: h('.status') }
}

/** The document's computed text size, in px. Runs in the page. */
function docFontSize() {
  return parseFloat(getComputedStyle(document.querySelector('.ProseMirror p')).fontSize)
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

    // The window itself: shown, at the page's own zoom, with no hidden menu.
    await measure('shell', async () => ({
      windowVisible: await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isVisible()
      ),
      applicationMenu: await app.evaluate(({ Menu }) =>
        Menu.getApplicationMenu() === null ? 'none' : 'present'
      ),
      pageZoomLevel: await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].webContents.getZoomLevel()
      ),
    }))

    // Text size grows the document and leaves the chrome alone.
    let defaultFont = null
    await measure('textSize', async () => {
      defaultFont = await page.evaluate(docFontSize)
      const before = { font: defaultFont, chrome: await page.evaluate(chromeHeights) }
      const larger = page.getByRole('button', { name: 'Larger text' })
      for (let i = 0; i < 4; i++) await larger.click()
      await page.waitForFunction(
        (f) =>
          parseFloat(getComputedStyle(document.querySelector('.ProseMirror p')).fontSize) === f,
        defaultFont + 4,
        { timeout: 5000 }
      )
      return {
        before,
        afterFourSteps: {
          font: await page.evaluate(docFontSize),
          chrome: await page.evaluate(chromeHeights),
          statusBarLabel: (await page.locator('.size__value').textContent()).trim(),
        },
        pageZoomLevel: await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].webContents.getZoomLevel()
        ),
      }
    })
    await shot(page, '05-text-larger')
    await measure('textSizeReset', async () => {
      // The size readout doubles as the reset.
      await page.locator('.size__value').click()
      await page.waitForFunction(
        () => document.documentElement.style.getPropertyValue('--doc-font-size') === '',
        null,
        { timeout: 5000 }
      )
      return { font: await page.evaluate(docFontSize), themeDefault: defaultFont }
    })

    // Column width: the theme's, a custom width, and the whole pane.
    const column = () =>
      page.evaluate(() => {
        const cs = getComputedStyle(document.querySelector('.editor-host'))
        return { maxWidth: cs.maxWidth, width: parseFloat(cs.width), paddingLeft: cs.paddingLeft }
      })
    const widthKind = () => page.getByRole('combobox', { name: 'Content width' })
    const openPrefs = async () => {
      await page.keyboard.press('Escape')
      await page.keyboard.press('Control+,')
      await page.waitForSelector('.prefs__panel', { state: 'visible', timeout: 5000 })
    }
    const closePrefs = async () => {
      await page.keyboard.press('Escape')
      await page.waitForSelector('.prefs__panel', { state: 'detached', timeout: 5000 })
    }
    await measure('width', async () => {
      const themeDefault = await column()
      await openPrefs()
      await widthKind().selectOption('custom')
      await page.getByRole('slider', { name: 'Content width in pixels' }).fill('1000')
      await page.waitForFunction(
        () => getComputedStyle(document.querySelector('.editor-host')).maxWidth === '1000px',
        null,
        { timeout: 5000 }
      )
      const custom = await column()
      await widthKind().selectOption('full')
      await page.waitForFunction(
        () => getComputedStyle(document.querySelector('.editor-host')).maxWidth === 'none',
        null,
        { timeout: 5000 }
      )
      await closePrefs()
      return { themeDefault, custom1000: custom, full: await column() }
    })
    await shot(page, '04-width-full')
    try {
      // Back to the theme's width, so the later shots show the default layout.
      await openPrefs()
      await widthKind().selectOption('theme')
      await closePrefs()
    } catch (err) {
      errors.push(`restore width: ${String(err).split('\n')[0]}`)
    }

    // Compact tabs: long names, capped width, full path in the tooltip.
    await measure('tabs', async () => {
      const long = 'a-rather-long-file-name-that-would-crowd-the-tab-bar'
      for (let i = 1; i <= 4; i++) {
        const name = `${long}-${i}.md`
        const path = join(work, name)
        writeFileSync(path, `# Tab ${i}\n`, 'utf8')
        await app.evaluate(({ BrowserWindow }, p) => {
          BrowserWindow.getAllWindows()[0].webContents.send('file:open-path', p)
        }, path)
        await page.waitForFunction(
          (n) => [...document.querySelectorAll('.tab__name')].some((e) => e.textContent === n),
          name,
          { timeout: 15_000 }
        )
      }
      return page.evaluate(() =>
        [...document.querySelectorAll('.tabs .tab')].map((t) => {
          const label = t.querySelector('.tab__name')
          return {
            name: label.textContent,
            width: Math.round(t.getBoundingClientRect().width),
            ellipsized: label.scrollWidth > label.clientWidth,
            tooltip: t.querySelector('.tab__select').getAttribute('title'),
          }
        })
      )
    })
    await shot(page, '06-tabs-compact')
    try {
      await page.locator('.tab__select', { hasText: 'sample.md' }).click()
      await page.waitForFunction(
        () =>
          document.querySelector('.ProseMirror')?.textContent?.includes('A document to look at'),
        null,
        { timeout: 15_000 }
      )
    } catch (err) {
      errors.push(`back to sample: ${String(err).split('\n')[0]}`)
    }

    // The block menu's surface, and what the two handle buttons say.
    await measure('blockMenu', async () => {
      await page.locator('.ProseMirror p').first().hover()
      await page.waitForSelector('.milkdown-block-handle', { state: 'visible', timeout: 5000 })
      const buttons = page.locator('.milkdown-block-handle .operation-item')
      const handleTitles = await buttons.evaluateAll((els) =>
        els.map((e) => e.getAttribute('title'))
      )
      const dragCursor = await buttons.nth(1).evaluate((e) => getComputedStyle(e).cursor)
      await buttons.first().click()
      await page.waitForSelector('.milkdown-slash-menu', { state: 'visible', timeout: 5000 })
      const menu = await page.evaluate(() => {
        const cs = getComputedStyle(document.querySelector('.milkdown-slash-menu'))
        return { background: cs.backgroundColor, backdropFilter: cs.backdropFilter }
      })
      await page.keyboard.press('Escape')
      return { handleTitles, dragCursor, ...menu }
    })

    // Code block colours come from the theme (Github, a light one, here).
    await measure('codeBlock', () =>
      page.evaluate(() => {
        const token = (name) => {
          const probe = document.createElement('span')
          probe.style.color = `var(${name})`
          document.body.appendChild(probe)
          const c = getComputedStyle(probe).color
          probe.remove()
          return c
        }
        const block = document.querySelector('.milkdown-code-block')
        const keyword = [...block.querySelectorAll('.cm-line span')].find(
          (s) => s.textContent === 'const'
        )
        const gutter = block.querySelector('.cm-activeLineGutter')
        return {
          theme: document.documentElement.getAttribute('data-theme'),
          text: getComputedStyle(block.querySelector('.cm-content')).color,
          codeFgToken: token('--code-fg'),
          keyword: keyword ? getComputedStyle(keyword).color : null,
          syntaxKeywordToken: token('--syntax-keyword'),
          activeLineGutterBackground: gutter ? getComputedStyle(gutter).backgroundColor : null,
        }
      })
    )
    await shot(page, '07-code-light', async () => {
      await page.locator('.milkdown-code-block').scrollIntoViewIfNeeded()
    })

    // One bar on a plain quote; the alert's label on one line.
    await measure('quotes', () =>
      page.evaluate(() => {
        const quote = document.querySelector('.ProseMirror blockquote:not([data-alert])')
        const alert = document.querySelector('.ProseMirror blockquote[data-alert]')
        const qs = getComputedStyle(quote)
        const label = getComputedStyle(alert, '::before')
        return {
          plainQuoteSecondBar: getComputedStyle(quote, '::before').content,
          plainQuoteBorder: `${qs.borderLeftWidth} ${qs.borderLeftStyle}`,
          alertLabel: {
            content: label.content,
            width: parseFloat(label.width),
            height: parseFloat(label.height),
            fontSize: label.fontSize,
            lineHeight: label.lineHeight,
          },
        }
      })
    )
    await shot(page, '08-alert', async () => {
      await page.locator('.ProseMirror blockquote[data-alert]').scrollIntoViewIfNeeded()
    })
    await page.evaluate(() => document.querySelector('.editor-scroll')?.scrollTo(0, 0))

    // Every built-in theme, by switching the attribute its stylesheet keys on,
    // with the page and code colours each one produces.
    const ids = await page.evaluate(async () =>
      (await window.api.themes.list()).filter((t) => t.builtin).map((t) => t.id)
    )
    const perTheme = {}
    for (const id of ids) {
      await shot(page, `theme-${id}`, async () => {
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), id)
      })
      perTheme[id] = await page
        .evaluate(() => {
          const block = document.querySelector('.milkdown-code-block')
          const keyword = [...(block?.querySelectorAll('.cm-line span') ?? [])].find(
            (s) => s.textContent === 'const'
          )
          return {
            page: getComputedStyle(document.querySelector('.editor-scroll')).backgroundColor,
            chrome: getComputedStyle(document.querySelector('.titlebar')).backgroundColor,
            codeText: block ? getComputedStyle(block.querySelector('.cm-content')).color : null,
            codeKeyword: keyword ? getComputedStyle(keyword).color : null,
          }
        })
        .catch((err) => ({ error: String(err).split('\n')[0] }))
    }
    measurements.themes = { count: ids.length, ids, perTheme }
  } finally {
    await app.close().catch(() => {})
    rmSync(work, { recursive: true, force: true })

    // Every group the report depends on. One missing is a broken probe.
    const expected = [
      'shell',
      'textSize',
      'textSizeReset',
      'width',
      'tabs',
      'blockMenu',
      'codeBlock',
      'quotes',
      'themes',
    ]
    for (const key of expected) {
      if (!(key in measurements)) errors.push(`missing measurement: ${key}`)
    }
    writeFileSync(join(OUT, 'measurements.json'), JSON.stringify(measurements, null, 2) + '\n')
    if (errors.length > 0) writeFileSync(join(OUT, 'errors.txt'), errors.join('\n') + '\n')
  }
  console.log(
    errors.length ? `\n${errors.length} shot(s) failed; see errors.txt` : '\nall shots captured'
  )
})()
