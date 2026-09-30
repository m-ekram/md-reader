import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, session: {} }))
vi.mock('./settings', () => ({
  getSettings: vi.fn(),
  patchSettings: vi.fn(),
  settingsState: vi.fn(),
}))

const { validLanguage } = await import('./spelling')

describe('validLanguage', () => {
  const available = ['en-US', 'en-GB', 'fr', 'de-DE']

  it('takes a language the session can check', () => {
    expect(validLanguage('fr', available)).toBe('fr')
    expect(validLanguage('en-GB', available)).toBe('en-GB')
  })

  it('refuses anything else', () => {
    expect(validLanguage('xx', available)).toBeNull()
    expect(validLanguage('', available)).toBeNull()
    expect(validLanguage(['fr'], available)).toBeNull()
    expect(validLanguage(null, available)).toBeNull()
  })
})
