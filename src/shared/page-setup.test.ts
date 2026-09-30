import { describe, expect, it } from 'vitest'
import { DEFAULT_PAGE_SETUP, validPageSetup } from './page-setup'

describe('validPageSetup', () => {
  it('keeps a setup that is valid', () => {
    const setup = { pageSize: 'Letter', landscape: true, margin: 'wide', pageNumbers: true }
    expect(validPageSetup(setup)).toEqual(setup)
  })

  it('puts back the default for anything it does not know', () => {
    expect(
      validPageSetup({ pageSize: 'Poster', landscape: 'yes', margin: 'huge', pageNumbers: 1 })
    ).toEqual(DEFAULT_PAGE_SETUP)
  })

  it('takes nothing at all, or not an object', () => {
    expect(validPageSetup(undefined)).toEqual(DEFAULT_PAGE_SETUP)
    expect(validPageSetup('A4')).toEqual(DEFAULT_PAGE_SETUP)
  })

  it('does not take a margin name from the object prototype', () => {
    expect(validPageSetup({ margin: 'toString' }).margin).toBe('normal')
  })
})
