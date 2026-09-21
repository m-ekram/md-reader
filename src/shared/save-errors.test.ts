import { describe, it, expect } from 'vitest'
import { explainSaveError } from './save-errors'

describe('explainSaveError', () => {
  it.each(['EPERM', 'EACCES', 'EBUSY', 'ENOSPC', 'EROFS', 'ENOENT'])(
    'explains %s in words rather than echoing the code',
    (code) => {
      const { summary, advice } = explainSaveError(code, `${code}: raw text`)
      expect(summary).not.toContain(code)
      expect(advice).not.toContain(code)
      expect(summary.length).toBeGreaterThan(10)
      expect(advice.length).toBeGreaterThan(10)
    }
  )

  it('covers both causes Windows reports as EPERM', () => {
    // A read-only attribute and a file held open by a sync client both
    // surface as EPERM, so the advice cannot pick one and be wrong half the time.
    const { advice } = explainSaveError('EPERM', '')
    expect(advice).toMatch(/read-only/i)
    expect(advice).toMatch(/another program|OneDrive|antivirus/i)
  })

  it('passes an unrecognised error through rather than inventing a reason', () => {
    const raw = 'EWHATEVER: something nobody anticipated'
    const { advice } = explainSaveError('EWHATEVER', raw)
    expect(advice).toBe(raw)
  })

  it('copes with no code at all', () => {
    const { summary, advice } = explainSaveError(undefined, 'Error: boom')
    expect(summary).toBeTruthy()
    expect(advice).toBe('Error: boom')
  })
})
