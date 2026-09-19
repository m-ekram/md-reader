import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'

const t0 = Date.now()

/** Generates a synthetic document of roughly `lines` lines for the perf probe. */
function sampleDoc(lines: number): string {
  const out: string[] = ['# Performance sample', '']
  let i = 0
  while (out.length < lines) {
    i++
    out.push(`## Section ${i}`, '')
    out.push(`Paragraph ${i} with **bold**, *italic*, \`code\` and a [link](https://example.com).`, '')
    out.push('- alpha', '- beta', '  - nested gamma', '')
    if (i % 5 === 0) out.push('```ts', `const x${i}: number = ${i}`, '```', '')
    if (i % 7 === 0) out.push('| a | b |', '| - | - |', `| ${i} | ${i * 2} |`, '')
    if (i % 11 === 0) out.push('> [!NOTE]', '> A callout.', '')
  }
  return out.slice(0, lines).join('\n')
}

ipcMain.handle('spike:sample', (_e, lines: number) => sampleDoc(lines))
ipcMain.on('spike:report', (_e, label: string, data: unknown) => {
  console.log(`[PHASE0] ${label}: ${JSON.stringify(data)}`)
  if (label === 'suite-complete' && process.env['PHASE0_AUTO']) {
    const metrics = app.getAppMetrics()
    const totalMb = metrics.reduce((s, m) => s + (m.memory?.workingSetSize ?? 0), 0) / 1024
    console.log(`[PHASE0] peak-rss-mb: ${totalMb.toFixed(1)}`)
    setTimeout(() => app.quit(), 500)
  }
})

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.on('ready-to-show', () => {
    const cold = Date.now() - t0
    console.log(`[PHASE0] cold-start-ms: ${cold}`)
    win.show()
    // Report steady-state memory once the renderer has settled.
    setTimeout(async () => {
      const metrics = app.getAppMetrics()
      const totalMb = metrics.reduce((s, m) => s + (m.memory?.workingSetSize ?? 0), 0) / 1024
      console.log(`[PHASE0] idle-rss-mb: ${totalMb.toFixed(1)} across ${metrics.length} processes`)
      if (process.env['PHASE0_IDLE']) app.quit()
    }, 6000)
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'] + (process.env['PHASE0_AUTO'] ? '?auto' : ''))
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), {
      search: process.env['PHASE0_AUTO']
        ? `auto&sizes=${process.env['PHASE0_SIZES'] ?? '500,1000,5000,20000'}`
        : '',
    })
  }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
