import { describe, expect, it } from 'vitest'
import type { SearchResult } from '../api/types'
import {
  matchesQuery,
  normalizeTitle,
  rankSearchResults,
  titleSimilarity,
} from './titleMatch'

describe('titleSimilarity', () => {
  it('scores exact normalized matches at 1', () => {
    expect(titleSimilarity('Breaking Bad', 'breaking-bad')).toBe(1)
    expect(titleSimilarity('S.H.I.E.L.D.', 'SHIELD')).toBe(1)
  })

  it('treats parenthetical qualifiers and leading articles as near-exact', () => {
    expect(titleSimilarity('The Office', 'The Office (US)')).toBeGreaterThanOrEqual(0.95)
    expect(titleSimilarity('Shameless', 'Shameless (US)')).toBeGreaterThanOrEqual(0.95)
    expect(titleSimilarity('Office (2005)', 'The Office')).toBeGreaterThanOrEqual(0.95)
  })

  it('scores partial titles by how much of the longer title they cover', () => {
    const ds9 = titleSimilarity('Deep Space Nine', 'Star Trek: Deep Space Nine')
    expect(ds9).toBeGreaterThanOrEqual(0.75)
    const shield = titleSimilarity('Agents of SHIELD', "Marvel's Agents of S.H.I.E.L.D.")
    expect(shield).toBeGreaterThanOrEqual(0.75)
  })

  it('does not let tiny fragments count as strong matches', () => {
    expect(titleSimilarity('24', '24 Hours in A&E')).toBeLessThan(0.75)
    expect(titleSimilarity('V', 'The Vampire Diaries')).toBeLessThan(0.5)
  })

  it('rewards word overlap regardless of order', () => {
    expect(titleSimilarity('office the', 'The Office')).toBeGreaterThanOrEqual(0.85)
  })

  it('scores unrelated titles near zero', () => {
    expect(titleSimilarity('panimu', 'Some Other Show')).toBe(0)
  })
})

describe('matchesQuery', () => {
  it('matches mid-word fragments through normalization', () => {
    expect(matchesQuery('The Office', 'ffic')).toBe(true)
    expect(matchesQuery('Breaking Bad', 'ngba')).toBe(true)
  })

  it('matches out-of-order word prefixes', () => {
    expect(matchesQuery('Breaking Bad', 'bad break')).toBe(true)
    expect(matchesQuery('The Office (US)', 'off us')).toBe(true)
  })

  it('is case- and diacritic-insensitive', () => {
    expect(matchesQuery('Café Nervosa', 'cafe')).toBe(true)
  })

  it('rejects non-matches and accepts the empty query', () => {
    expect(matchesQuery('Breaking Bad', 'xyz')).toBe(false)
    expect(matchesQuery('Breaking Bad', '  ')).toBe(true)
  })
})

let seq = 0
function result(name: string, extra: Partial<SearchResult> = {}): SearchResult {
  seq++
  return { objectID: `series-${seq}`, tvdb_id: String(seq), name, type: 'series', ...extra }
}

describe('rankSearchResults', () => {
  it('surfaces the closest titles first, keeping API order for ties', () => {
    const a = result('Doctor Who')
    const b = result('The Office (US)')
    const c = result('Office Ladies')
    const ranked = rankSearchResults([a, b, c], 'the office')
    expect(ranked.map((r) => r.name)).toEqual(['The Office (US)', 'Office Ladies', 'Doctor Who'])
  })

  it('ranks alias matches as highly as name matches', () => {
    const other = result('Completely Different')
    const aliased = result('Formula 1: Drive to Survive', { aliases: ['Drive to Survive'] })
    const ranked = rankSearchResults([other, aliased], 'drive to survive')
    expect(ranked[0]).toBe(aliased)
  })

  it('normalizeTitle stays consistent with the tvtime re-export', async () => {
    const tvtime = await import('./tvtime')
    expect(tvtime.normalizeTitle('Café & Croissant')).toBe(normalizeTitle('Café & Croissant'))
  })
})
