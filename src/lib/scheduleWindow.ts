// Decides WHICH shows the schedule needs, and in what order — the core of
// loading a release list by day instead of by show.
//
// Two ideas do the heavy lifting:
//   1. A show whose known air span cannot intersect the visible window is
//      never fetched at all. For a library of mostly-finished shows this
//      removes the vast majority of requests.
//   2. Whatever remains is fetched nearest-airing-first, so the days around
//      Today fill in before distant ones.

import { daysBetween } from './dates'
import type { TrackedShow } from '../types'

const isEnded = (show: TrackedShow): boolean => {
  const status = (show.airStatus ?? '').toLowerCase()
  return status.includes('end') || status.includes('cancel')
}

/**
 * False only when the show provably has no episode inside [start, end].
 * Unknown dates always return true — a missing field must never hide an
 * episode, it only costs a fetch we could have skipped.
 */
export function canHaveEpisodesInWindow(
  show: TrackedShow,
  start: string,
  end: string,
): boolean {
  // Nothing had aired yet when the window closed.
  if (show.firstAired && show.firstAired > end) return false
  // A finished show cannot gain episodes after its last one.
  if (isEnded(show) && show.lastAired && show.lastAired < start) return false
  return true
}

/**
 * Fetch order for shows inside the window: lower sorts first.
 * Shows with a known air date inside the window are ranked by how close that
 * date is to today, so imminent episodes resolve first; the rest fall back to
 * airing status, with finished shows (past episodes only) last.
 */
export function windowPriority(
  show: TrackedShow,
  start: string,
  end: string,
  today: string,
): number {
  const inWindow = (date?: string) => !!date && date >= start && date <= end
  const known: number[] = []
  if (inWindow(show.nextAired)) known.push(Math.abs(daysBetween(today, show.nextAired!)))
  if (inWindow(show.lastAired)) known.push(Math.abs(daysBetween(today, show.lastAired!)))
  if (known.length) return Math.min(...known)

  const status = (show.airStatus ?? '').toLowerCase()
  if (status.includes('continu')) return 1000
  if (status.includes('upcoming')) return 1200
  return 2000
}

export interface WindowPlan {
  /** Shows that may contribute to the window, nearest-airing first. */
  relevant: TrackedShow[]
  /** Shows provably outside the window — not fetched at all. */
  skipped: TrackedShow[]
}

/** Split a library into what the window needs (ordered) and what it doesn't. */
export function planWindow(
  shows: TrackedShow[],
  start: string,
  end: string,
  today: string,
): WindowPlan {
  const relevant: TrackedShow[] = []
  const skipped: TrackedShow[] = []
  for (const show of shows) {
    if (canHaveEpisodesInWindow(show, start, end)) relevant.push(show)
    else skipped.push(show)
  }
  relevant.sort(
    (a, b) =>
      windowPriority(a, start, end, today) - windowPriority(b, start, end, today) ||
      a.name.localeCompare(b.name),
  )
  return { relevant, skipped }
}
