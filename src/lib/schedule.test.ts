import { describe, expect, it } from 'vitest'
import type { Ep, TrackedShow } from '../types'
import { indexShow, removeShow, showsWithoutDates, toDays, type DayIndex } from './schedule'

function show(id: number, name: string, airStatus = 'Continuing'): TrackedShow {
  return {
    id,
    name,
    airStatus,
    genres: [],
    addedAt: 0,
    updatedAt: 0,
    userStatus: 'watching',
    favorite: false,
    watched: {},
  }
}

function ep(id: number, s: number, e: number, aired: string | null): Ep {
  return { id, s, e, name: `Ep ${e}`, aired, runtime: null }
}

const EPS_A = [ep(11, 1, 1, '2026-08-18'), ep(12, 1, 2, '2026-08-25'), ep(13, 1, 3, null)]
const EPS_B = [ep(21, 3, 4, '2026-08-18'), ep(22, 3, 5, '2026-09-30')]
const NAMES = new Map([
  [1, 'Alpha'],
  [2, 'Beta'],
])

function build(start: string, end: string): DayIndex {
  const index: DayIndex = new Map()
  // Insert Beta first to prove ordering comes from the name sort, not arrival.
  indexShow(index, 2, EPS_B, start, end)
  indexShow(index, 1, EPS_A, start, end)
  return index
}

describe('indexShow / toDays', () => {
  it('groups by date, sorted ascending, entries sorted by show name', () => {
    const days = toDays(build('2026-08-01', '2026-09-01'), NAMES)
    expect(days.map((d) => d.date)).toEqual(['2026-08-18', '2026-08-25'])
    expect(days[0].entries.map((e) => e.showId)).toEqual([1, 2])
  })

  it('respects window bounds inclusively and skips undated episodes', () => {
    const days = toDays(build('2026-08-25', '2026-09-30'), NAMES)
    expect(days.map((d) => d.date)).toEqual(['2026-08-25', '2026-09-30'])
    expect(days.flatMap((d) => d.entries.map((e) => e.ep.id))).not.toContain(13)
  })

  it('re-indexing a show replaces its entries instead of duplicating them', () => {
    const index = build('2026-08-01', '2026-09-01')
    indexShow(index, 1, EPS_A, '2026-08-01', '2026-09-01')
    const days = toDays(index, NAMES)
    const aug18 = days.find((d) => d.date === '2026-08-18')!
    expect(aug18.entries.filter((e) => e.showId === 1)).toHaveLength(1)
  })

  it('re-indexing with a narrower window drops the out-of-range entries', () => {
    const index = build('2026-08-01', '2026-09-01')
    indexShow(index, 1, EPS_A, '2026-08-20', '2026-09-01')
    const days = toDays(index, NAMES)
    expect(days.find((d) => d.date === '2026-08-18')?.entries.map((e) => e.showId)).toEqual([2])
  })

  it('removeShow prunes entries and empties the day', () => {
    const index = build('2026-08-01', '2026-09-01')
    removeShow(index, 2)
    removeShow(index, 1)
    expect(toDays(index, NAMES)).toEqual([])
  })

  it('keeps entries stable when a show is missing from the name map', () => {
    const index: DayIndex = new Map()
    indexShow(index, 99, EPS_A, '2026-08-01', '2026-09-01')
    expect(toDays(index, NAMES)[0].entries[0].showId).toBe(99)
  })
})

describe('showsWithoutDates', () => {
  it('flags running shows with no scheduled episode from today onward', () => {
    const noFuture = show(3, 'Gamma')
    const eps: Record<number, Ep[]> = { 1: EPS_A, 3: [ep(31, 1, 1, '2026-01-01')] }
    const result = showsWithoutDates([show(1, 'Alpha'), noFuture], eps, '2026-08-18')
    expect(result.map((s) => s.id)).toEqual([3])
  })

  it('ignores ended shows and shows still loading', () => {
    const ended = show(4, 'Delta', 'Ended')
    const loading = show(5, 'Epsilon')
    expect(showsWithoutDates([ended, loading], { 4: [] }, '2026-08-18')).toEqual([])
  })
})
