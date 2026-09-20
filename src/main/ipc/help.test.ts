import { describe, it, expect, vi } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => '' }, ipcMain: { handle: vi.fn() } }))
vi.mock('../log', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const { HELP_TOPICS } = await import('./help')

const DOCS = join(__dirname, '..', '..', '..', 'docs')
const HELP_COMMANDS = readFileSync(
  join(__dirname, '..', '..', 'renderer', 'src', 'commands', 'help-commands.ts'),
  'utf8'
)

/**
 * A help topic is three things that have to agree: a command, an entry in the
 * topic map, and a file. Miss the file and the menu item opens an error notice
 * in a shipped build — where the docs come from a different directory than in
 * development, so it is the packaged build that would break.
 */
describe.each(Object.entries(HELP_TOPICS))('help topic %s', (id, topic) => {
  it('has a file behind it', () => {
    expect(existsSync(join(DOCS, topic.file)), `${topic.file} is missing`).toBe(true)
  })

  it('has content, starting with its own heading', () => {
    const text = readFileSync(join(DOCS, topic.file), 'utf8')
    expect(text.length).toBeGreaterThan(200)
    expect(text.startsWith('# '), `${topic.file} should open with a heading`).toBe(true)
  })

  it('is reachable from a command', () => {
    expect(HELP_COMMANDS).toContain(`openTopic('${id}')`)
  })
})

describe('the docs folder', () => {
  it('has no file that no topic points at', () => {
    const claimed = new Set(Object.values(HELP_TOPICS).map((t) => t.file))
    const stray = readdirSync(DOCS).filter((f) => f.endsWith('.md') && !claimed.has(f))
    expect(stray, 'a doc nothing links to cannot be opened from the menu').toEqual([])
  })

  it('is bundled into the packaged build', () => {
    // Without this the topics work in development and fail once installed,
    // which is the worst place to find out.
    const builder = readFileSync(join(__dirname, '..', '..', '..', 'electron-builder.yml'), 'utf8')
    expect(builder).toContain('extraResources')
    expect(builder).toMatch(/from:\s*docs/)
  })
})
