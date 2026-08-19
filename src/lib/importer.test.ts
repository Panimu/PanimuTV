// The importer's network paths need TheTVDB; its matching policy does not.
// pickSearchResult is the pure guard that decides whether a title search is
// trusted — the piece that keeps a bad export from importing the wrong show.

import './testLocalStorage'
import { describe, expect, it } from 'vitest'
import type { SearchResult } from '../api/types'
import { pickSearchResult } from './importer'

let seq = 0
function result(name: string, extra: Partial<SearchResult> = {}): SearchResult {
  seq++
  return { objectID: `series-${seq}`, tvdb_id: String(seq), name, type: 'series', ...extra }
}

describe('pickSearchResult', () => {
  it('prefers an exact normalized-title match over the top hit', () => {
    const wrong = result('Breaking Bad: The Movie')
    const right = result('Breaking Bad')
    expect(pickSearchResult([wrong, right], 'breaking bad', false)).toBe(right)
  })

  it('matches through translations', () => {
    const r = result('La Casa de Papel', { translations: { eng: 'Money Heist' } })
    expect(pickSearchResult([r], 'Money Heist', false)).toBe(r)
  })

  it('ignores punctuation and diacritics when matching', () => {
    const r = result('Marvel\u2019s Agents of S.H.I.E.L.D.')
    expect(pickSearchResult([r], 'marvels agents of shield', false)).toBe(r)
  })

  it('refuses a loose match for follow-only entries', () => {
    const loose = result('Some Other Show')
    expect(pickSearchResult([loose], 'panimu', false)).toBeNull()
  })

  it('accepts the top hit when there is watch evidence', () => {
    const loose = result('The Office (US)')
    expect(pickSearchResult([loose], 'The Office', true)).toBe(loose)
  })

  it('accepts qualifier variants for follow-only entries', () => {
    const us = result('The Office (US)')
    expect(pickSearchResult([us], 'The Office', false)).toBe(us)
  })

  it('accepts partial titles that cover most of the real name', () => {
    const ds9 = result('Star Trek: Deep Space Nine')
    expect(pickSearchResult([ds9], 'Deep Space Nine', false)).toBe(ds9)
  })

  it('matches through aliases', () => {
    const aliased = result('Formula 1: Drive to Survive', { aliases: ['Drive to Survive'] })
    expect(pickSearchResult([aliased], 'Drive to Survive', false)).toBe(aliased)
  })

  it('still refuses tiny-fragment matches for follow-only entries', () => {
    const noisy = result('24 Hours in A&E')
    expect(pickSearchResult([noisy], '24', false)).toBeNull()
  })

  it('with watch evidence, prefers the best partial match over the first hit', () => {
    const first = result('Random Show')
    const better = result('The Vampire Diaries')
    expect(pickSearchResult([first, better], 'Vampire Diaries', true)).toBe(better)
  })

  it('skips non-series results and invalid ids', () => {
    const movie = { ...result('Exact Name'), type: 'movie' }
    const invalid = { ...result('Exact Name'), tvdb_id: '0' }
    expect(pickSearchResult([movie, invalid], 'Exact Name', true)).toBeNull()
  })
})
