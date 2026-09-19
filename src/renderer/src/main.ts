import { Crepe, CrepeFeature } from '@milkdown/crepe'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
import './spike.css'

declare global {
  interface Window {
    api: {
      report(label: string, data: unknown): void
      readSample(lines: number): Promise<string>
    }
  }
}

const bar = document.getElementById('bar')!
const host = document.getElementById('app')!

const SEED = `# Phase 0 feel check

Type below and judge how the inline editing feels. Things to try:

- \`# \` then space, \`- \` then space, \`> \` then space
- \`|\` table creation, and Tab between cells
- \`$e^{i\pi}+1=0$\` inline math, and \`$$\` block math
- \`\`\`ts fenced code with a language picker
- **bold**, *italic*, and whether markers hide when the caret leaves

> [!NOTE]
> Does this render as a callout, or as a quote with literal brackets?

| feature | works |
| - | - |
| tables | ? |
`

let crepe: Crepe | null = null

async function mount(markdown: string, label: string): Promise<number> {
  if (crepe) await crepe.destroy()
  host.innerHTML = ''
  const t = performance.now()
  crepe = new Crepe({
    root: host,
    defaultValue: markdown,
    features: { [CrepeFeature.AI]: false, [CrepeFeature.TopBar]: false },
  })
  await crepe.create()
  const ms = performance.now() - t
  window.api.report(`mount-${label}`, { lines: markdown.split('\n').length, ms: +ms.toFixed(1) })
  return ms
}

/** Measures per-keystroke latency by dispatching real input into the editor. */
async function typingProbe(label: string): Promise<void> {
  const view = host.querySelector('.ProseMirror') as HTMLElement | null
  if (!view) return
  view.focus()
  const samples: number[] = []
  for (let i = 0; i < 40; i++) {
    const t = performance.now()
    document.execCommand('insertText', false, 'x')
    await new Promise(requestAnimationFrame)
    samples.push(performance.now() - t)
  }
  samples.sort((a, b) => a - b)
  window.api.report(`typing-${label}`, {
    median: +samples[Math.floor(samples.length / 2)].toFixed(2),
    p95: +samples[Math.floor(samples.length * 0.95)].toFixed(2),
    max: +samples[samples.length - 1].toFixed(2),
  })
}

async function runPerfSuite(): Promise<void> {
  bar.textContent = 'Running perf suite…'
  const rows: string[] = []
  const sizes = (new URLSearchParams(location.search).get('sizes') ?? '500,1000,5000,20000')
    .split(',').map(Number)
  for (const lines of sizes) {
    const md = await window.api.readSample(lines)
    const ms = await mount(md, String(lines))
    await typingProbe(String(lines))
    rows.push(`${lines} lines: mount ${ms.toFixed(0)}ms`)
    bar.textContent = rows.join('  |  ')
  }
  bar.textContent = rows.join('  |  ') + '  — see terminal for typing latency'
  window.api.report('suite-complete', { done: true })
}

const btn = document.createElement('button')
btn.textContent = 'Run perf suite'
btn.onclick = runPerfSuite
bar.appendChild(btn)

mount(SEED, 'seed').then(() => {
  // Auto-run when driven from the command line, so the numbers are reproducible.
  if (location.search.includes('auto')) void runPerfSuite()
})
