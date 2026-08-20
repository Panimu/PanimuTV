import { describe, expect, it } from 'vitest'
import type { TrackedShow } from '../types'
import { canHaveEpisodesInWindow, planWindow, windowPriority } from './scheduleWindow'

const TODAY = '2026-08-18'
const START = '2026-08-11'
const END = '2026-10-17'

function show(id: number, name: string, extra: Partial<TrackedShow> = {}): TrackedShow {
  return {
    id,
    name,
    genres: [],
    addedAt: 0,
    updatedAt: 0,
    userStatus: 'watching',
    favorite: false,
    watched: {},
    ...extra,
  }
}

describe('canHaveEpisodesInWindow', () => {
  it('skips finished shows whose run ended before the window', () => {
    const ended = show(1, 'Old', { airStatus: 'Ended', lastAired: '2020-01-01' })
    expect(canHaveEpisodesInWindow(ended, START, END)).toBe(false)
  })

  it('skips shows that had not premiered by the end of the window', () => {
    const future = show(2, 'Future', { airStatus: 'Upcoming', firstAired: '2027-05-01' })
    expect(canHaveEpisodesInWindow(future, START, END)).toBe(false)
  })

  it('keeps a finished show whose last episode falls inside the window', () => {
    const recent = show(3, 'Recent', { airStatus: 'Ended', lastAired: '2026-08-14' })
    expect(canHaveEpisodesInWindow(recent, START, END)).toBe(true)
  })

  it('keeps continuing shows even when lastAired is old', () => {
    const running = show(4, 'Running', { airStatus: 'Continuing', lastAired: '2019-01-01' })
    expect(canHaveEpisodesInWindow(running, START, END)).toBe(true)
  })

  it('never skips a show with unknown dates', () => {
    expect(canHaveEpisodesInWindow(show(5, 'Unknown'), START, END)).toBe(true)
    expect(
      canHaveEpisodesInWindow(show(6, 'NoLast', { airStatus: 'Ended' }), START, END),
    ).toBe(true)
  })

  it('treats Cancelled like Ended', () => {
    const cancelled = show(7, 'Axed', { airStatus: 'Cancelled', lastAired: '2018-06-01' })
    expect(canHaveEpisodesInWindow(cancelled, START, END)).toBe(false)
  })
})

describe('windowPriority', () => {
  it('ranks imminent airings ahead of distant ones', () => {
    const soon = show(1, 'Soon', { nextAired: '2026-08-19' })
    const later = show(2, 'Later', { nextAired: '2026-10-01' })
    expect(windowPriority(soon, START, END, TODAY)).toBeLessThan(
      windowPriority(later, START, END, TODAY),
    )
  })

  it('ranks a recent past episode as highly as an imminent one', () => {
    const justAired = show(3, 'Just aired', { airStatus: 'Ended', lastAired: '2026-08-17' })
    expect(windowPriority(justAired, START, END, TODAY)).toBe(1)
  })

  it('ignores dates that fall outside the window', () => {
    const outside = show(4, 'Outside', { nextAired: '2027-01-01', airStatus: 'Continuing' })
    expect(windowPriority(outside, START, END, TODAY)).toBe(1000)
  })

  it('puts finished shows last when no date is known', () => {
    const running = show(5, 'Running', { airStatus: 'Continuing' })
    const upcoming = show(6, 'Upcoming', { airStatus: 'Upcoming' })
    const ended = show(7, 'Ended', { airStatus: 'Ended' })
    expect(windowPriority(running, START, END, TODAY)).toBeLessThan(
      windowPriority(upcoming, START, END, TODAY),
    )
    expect(windowPriority(upcoming, START, END, TODAY)).toBeLessThan(
      windowPriority(ended, START, END, TODAY),
    )
  })
})

describe('planWindow', () => {
  it('separates skippable shows and orders the rest nearest-airing first', () => {
    const library = [
      show(1, 'Ancient', { airStatus: 'Ended', lastAired: '2001-01-01' }),
      show(2, 'Distant', { airStatus: 'Continuing', nextAired: '2026-10-10' }),
      show(3, 'Tomorrow', { airStatus: 'Continuing', nextAired: '2026-08-19' }),
      show(4, 'Unknown dates', { airStatus: 'Continuing' }),
    ]
    const { relevant, skipped } = planWindow(library, START, END, TODAY)
    expect(skipped.map((s) => s.id)).toEqual([1])
    expect(relevant.map((s) => s.name)).toEqual(['Tomorrow', 'Distant', 'Unknown dates'])
  })

  it('breaks priority ties by name for a stable order', () => {
    const library = [
      show(1, 'Zulu', { airStatus: 'Continuing' }),
      show(2, 'Alpha', { airStatus: 'Continuing' }),
    ]
    expect(planWindow(library, START, END, TODAY).relevant.map((s) => s.name)).toEqual([
      'Alpha',
      'Zulu',
    ])
  })

  it('a wider window reclaims previously skipped shows', () => {
    const old = show(1, 'Old', { airStatus: 'Ended', lastAired: '2020-06-15' })
    expect(planWindow([old], START, END, TODAY).skipped).toHaveLength(1)
    expect(planWindow([old], '2020-01-01', END, TODAY).relevant).toHaveLength(1)
  })
})
