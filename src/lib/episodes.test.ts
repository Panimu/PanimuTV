import { describe, expect, it } from 'vitest'
import type { Ep } from '../types'
import {
  epCode,
  episodesLeft,
  epsUpTo,
  finaleLabel,
  nextUp,
  premiereLabel,
  progressOf,
  upcoming,
} from './episodes'

const TODAY = '2026-08-18'

function ep(id: number, s: number, e: number, aired: string | null, extra: Partial<Ep> = {}): Ep {
  return { id, s, e, name: `Ep ${s}x${e}`, aired, runtime: 42, ...extra }
}

// A show with a special, two aired seasons, and an upcoming episode.
const EPS: Ep[] = [
  ep(100, 0, 1, '2025-12-25'), // special — excluded from progress/next-up
  ep(1, 1, 1, '2025-01-01'),
  ep(2, 1, 2, '2025-01-08'),
  ep(3, 2, 1, '2026-08-10'),
  ep(4, 2, 2, '2026-08-17'),
  ep(5, 2, 3, '2026-08-25', { finale: 'season' }), // future
  ep(6, 2, 4, null), // unscheduled
]

describe('progressOf', () => {
  it('counts only aired regular episodes', () => {
    const progress = progressOf({ 1: 1, 100: 1 }, EPS, TODAY)
    expect(progress.aired).toBe(4)
    expect(progress.watched).toBe(1) // the special doesn't count
    expect(progress.total).toBe(6)
  })

  it('handles an empty list', () => {
    expect(progressOf({}, [], TODAY)).toEqual({ watched: 0, aired: 0, total: 0, pct: 0 })
  })
})

describe('nextUp', () => {
  it('returns the first aired unwatched regular episode in order', () => {
    expect(nextUp({}, EPS, TODAY)?.id).toBe(1)
    expect(nextUp({ 1: 1 }, EPS, TODAY)?.id).toBe(2)
    expect(nextUp({ 1: 1, 2: 1, 3: 1, 4: 1 }, EPS, TODAY)).toBeNull() // rest is future/TBA
  })

  it('never suggests specials', () => {
    const next = nextUp({ 1: 1, 2: 1, 3: 1, 4: 1 }, EPS, TODAY)
    expect(next).toBeNull()
  })
})

describe('episodesLeft / upcoming', () => {
  it('counts aired unwatched regulars', () => {
    expect(episodesLeft({ 1: 1 }, EPS, TODAY)).toBe(3)
  })

  it('lists future episodes soonest first', () => {
    const future = upcoming(EPS, TODAY)
    expect(future.map((e) => e.id)).toEqual([5])
  })
})

describe('epsUpTo', () => {
  it('collects aired regulars up to and including the target', () => {
    const ids = epsUpTo(EPS, EPS.find((e) => e.id === 3)!, TODAY).map((e) => e.id)
    expect(ids).toEqual([1, 2, 3])
  })
})

describe('labels', () => {
  it('formats episode codes', () => {
    expect(epCode(ep(9, 2, 3, null))).toBe('S02E03')
  })

  it('flags premieres and finales', () => {
    expect(premiereLabel(ep(9, 1, 1, null))).toBe('Series premiere')
    expect(premiereLabel(ep(9, 3, 1, null))).toBe('Season premiere')
    expect(premiereLabel(ep(9, 3, 2, null))).toBeNull()
    expect(premiereLabel(ep(9, 0, 1, null))).toBeNull()
    expect(finaleLabel(ep(9, 3, 8, null, { finale: 'season' }))).toBe('Season finale')
    expect(finaleLabel(ep(9, 3, 8, null))).toBeNull()
  })
})
