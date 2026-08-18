import { describe, expect, it } from 'vitest'
import type { Ep, TrackedShow } from '../types'
import { buildSchedule, showsWithoutDates } from './schedule'

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

const SHOW_A = show(1, 'Alpha')
const SHOW_B = show(2, 'Beta')

const EPS: Record<number, Ep[]> = {
  1: [ep(11, 1, 1, '2026-08-18'), ep(12, 1, 2, '2026-08-25'), ep(13, 1, 3, null)],
  2: [ep(21, 3, 4, '2026-08-18'), ep(22, 3, 5, '2026-09-30')],
}

describe('buildSchedule', () => {
  it('groups by date, sorted ascending, items sorted by show name', () => {
    const groups = buildSchedule([SHOW_B, SHOW_A], EPS, '2026-08-01', '2026-09-01')
    expect(groups.map((g) => g.date)).toEqual(['2026-08-18', '2026-08-25'])
    expect(groups[0].items.map((i) => i.show.name)).toEqual(['Alpha', 'Beta'])
  })

  it('respects the window bounds inclusively and skips undated episodes', () => {
    const groups = buildSchedule([SHOW_A, SHOW_B], EPS, '2026-08-25', '2026-09-30')
    expect(groups.map((g) => g.date)).toEqual(['2026-08-25', '2026-09-30'])
    const allIds = groups.flatMap((g) => g.items.map((i) => i.ep.id))
    expect(allIds).not.toContain(13)
  })

  it('handles shows whose episodes have not loaded yet', () => {
    const groups = buildSchedule([SHOW_A], {}, '2026-08-01', '2026-09-01')
    expect(groups).toEqual([])
  })
})

describe('showsWithoutDates', () => {
  it('flags running shows with no scheduled episode from today onward', () => {
    const noFuture = show(3, 'Gamma')
    const eps: Record<number, Ep[]> = { ...EPS, 3: [ep(31, 1, 1, '2026-01-01')] }
    const result = showsWithoutDates([SHOW_A, noFuture], eps, '2026-08-18')
    expect(result.map((s) => s.id)).toEqual([3])
  })

  it('ignores ended shows and shows still loading', () => {
    const ended = show(4, 'Delta', 'Ended')
    const loading = show(5, 'Epsilon')
    const result = showsWithoutDates([ended, loading], { 4: [] }, '2026-08-18')
    expect(result).toEqual([])
  })
})
