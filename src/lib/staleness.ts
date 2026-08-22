// A show is "stale" when it's actively releasing episodes but the user has
// stopped watching — the signal used to declutter the default Watch Next
// view. Kept in its own module, isolated from the rest of the episode logic,
// because this definition is expected to change.
//
// Current definition: a show is stale when
//   (a) a regular episode aired within the last `staleDays`, AND
//   (b) no episode of that show was marked watched within the last `staleDays`
// Both conditions are required — a show on hiatus (no recent release) is
// never stale regardless of watch history, and a show you're keeping up
// with (recent watch activity) is never stale regardless of how much it airs.

import { DAY_MS, addDays } from './dates'
import { isRegular } from './episodes'
import type { Ep, TrackedShow } from '../types'

export const DEFAULT_STALE_DAYS = 50

/** Ms since the show's most recently watched episode, or Infinity if never watched. */
export function msSinceLastWatched(show: TrackedShow, now = Date.now()): number {
  const timestamps = Object.values(show.watched)
  if (!timestamps.length) return Infinity
  return now - Math.max(...timestamps)
}

/** True when a regular (non-special) episode aired within the last `staleDays`. */
export function hasRecentRelease(eps: Ep[], today: string, staleDays: number): boolean {
  const cutoff = addDays(today, -staleDays)
  return eps.some((ep) => isRegular(ep) && ep.aired && ep.aired <= today && ep.aired >= cutoff)
}

export function isStale(
  show: TrackedShow,
  eps: Ep[],
  today: string,
  staleDays: number = DEFAULT_STALE_DAYS,
  now = Date.now(),
): boolean {
  if (!hasRecentRelease(eps, today, staleDays)) return false
  return msSinceLastWatched(show, now) > staleDays * DAY_MS
}
