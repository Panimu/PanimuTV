import { describe, expect, it } from 'vitest'
import { DAY_MS, addDays } from './dates'
import { hasRecentRelease, isStale, msSinceLastWatched } from './staleness'
import type { Ep, TrackedShow } from '../types'

const TODAY = '2026-08-18'

function ep(id: number, s: number, aired: string | null): Ep {
  return { id, s, e: 1, name: `Ep ${id}`, aired, runtime: 45 }
}

function show(watched: Record<number, number>): TrackedShow {
  return {
    id: 1,
    name: 'Test Show',
    genres: [],
    addedAt: 0,
    updatedAt: 0,
    userStatus: 'watching',
    favorite: false,
    watched,
  }
}

describe('msSinceLastWatched', () => {
  it('returns Infinity when nothing has been watched', () => {
    expect(msSinceLastWatched(show({}))).toBe(Infinity)
  })

  it('uses the most recent watched timestamp among several', () => {
    const now = 1_000_000
    const s = show({ 1: 100, 2: 900_000, 3: 500 })
    expect(msSinceLastWatched(s, now)).toBe(now - 900_000)
  })
})

describe('hasRecentRelease', () => {
  it('is true when a regular episode aired within the window (inclusive)', () => {
    const cutoff = addDays(TODAY, -50)
    expect(hasRecentRelease([ep(1, 1, cutoff)], TODAY, 50)).toBe(true)
    expect(hasRecentRelease([ep(1, 1, TODAY)], TODAY, 50)).toBe(true)
  })

  it('is false when the most recent aired episode is just outside the window', () => {
    const justOutside = addDays(TODAY, -51)
    expect(hasRecentRelease([ep(1, 1, justOutside)], TODAY, 50)).toBe(false)
  })

  it('ignores specials', () => {
    expect(hasRecentRelease([ep(1, 0, TODAY)], TODAY, 50)).toBe(false)
  })

  it('ignores unaired and null-date episodes', () => {
    const future = addDays(TODAY, 5)
    expect(hasRecentRelease([ep(1, 1, future), ep(2, 1, null)], TODAY, 50)).toBe(false)
  })

  it('is false for an empty episode list', () => {
    expect(hasRecentRelease([], TODAY, 50)).toBe(false)
  })
})

describe('isStale', () => {
  const NOW = 2_000_000_000_000 // fixed instant, so ms-precision boundary tests are deterministic
  const recentEp = [ep(1, 1, TODAY)]
  const oldEp = [ep(1, 1, addDays(TODAY, -200))]

  it('is never stale without a recent release, regardless of watch history', () => {
    expect(isStale(show({}), oldEp, TODAY, 50, NOW)).toBe(false)
    const longAgoWatch = show({ 1: NOW - 500 * DAY_MS })
    expect(isStale(longAgoWatch, oldEp, TODAY, 50, NOW)).toBe(false)
  })

  it('is stale when releasing recently but never watched', () => {
    expect(isStale(show({}), recentEp, TODAY, 50, NOW)).toBe(true)
  })

  it('is stale when releasing recently and last watched over staleDays ago', () => {
    const s = show({ 1: NOW - 51 * DAY_MS })
    expect(isStale(s, recentEp, TODAY, 50, NOW)).toBe(true)
  })

  it('is not stale when releasing recently but watched within staleDays', () => {
    const s = show({ 1: NOW - 10 * DAY_MS })
    expect(isStale(s, recentEp, TODAY, 50, NOW)).toBe(false)
  })

  it('treats exactly staleDays since last watch as not-yet-stale', () => {
    const s = show({ 1: NOW - 50 * DAY_MS })
    expect(isStale(s, recentEp, TODAY, 50, NOW)).toBe(false)
  })

  it('respects a custom staleDays', () => {
    const s = show({ 1: NOW - 15 * DAY_MS })
    expect(isStale(s, recentEp, TODAY, 10, NOW)).toBe(true)
    expect(isStale(s, recentEp, TODAY, 20, NOW)).toBe(false)
  })
})
