// The scrollable release list, indexed by DAY.
//
// The index holds `showId` rather than a show object: episode data is stable
// and expensive to rebuild, while show records change every time the user
// marks something watched. Keeping them apart lets the index survive those
// updates, with the page resolving live show state at render time.

import type { Ep, TrackedShow } from '../types'

export interface ScheduleEntry {
  showId: number
  ep: Ep
}

export interface ScheduleDay {
  date: string
  entries: ScheduleEntry[]
}

/** date (YYYY-MM-DD) → episodes airing that day. */
export type DayIndex = Map<string, ScheduleEntry[]>

/**
 * Add one show's in-window episodes to the index, replacing any entries it
 * previously contributed (so a refetch cannot duplicate rows).
 * Cost is proportional to that show's episode count, not the whole library.
 */
export function indexShow(
  index: DayIndex,
  showId: number,
  eps: Ep[],
  start: string,
  end: string,
): void {
  removeShow(index, showId)
  for (const ep of eps) {
    if (!ep.aired || ep.aired < start || ep.aired > end) continue
    const day = index.get(ep.aired)
    if (day) day.push({ showId, ep })
    else index.set(ep.aired, [{ showId, ep }])
  }
}

export function removeShow(index: DayIndex, showId: number): void {
  for (const [date, entries] of index) {
    const kept = entries.filter((entry) => entry.showId !== showId)
    if (kept.length === entries.length) continue
    if (kept.length) index.set(date, kept)
    else index.delete(date)
  }
}

/** Flatten the index into day groups, oldest first, each sorted by show name. */
export function toDays(index: DayIndex, nameById: Map<number, string>): ScheduleDay[] {
  const days: ScheduleDay[] = []
  for (const [date, entries] of index) {
    days.push({
      date,
      entries: [...entries].sort(
        (a, b) =>
          (nameById.get(a.showId) ?? '').localeCompare(nameById.get(b.showId) ?? '') ||
          a.ep.s - b.ep.s ||
          a.ep.e - b.ep.e,
      ),
    })
  }
  return days.sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Shows that are still running (or announced) but have no scheduled episode
 * within the given window — the "waiting for dates" bucket.
 */
export function showsWithoutDates(
  shows: TrackedShow[],
  epsByShow: Record<number, Ep[]>,
  fromDate: string,
): TrackedShow[] {
  return shows.filter((show) => {
    const status = (show.airStatus ?? '').toLowerCase()
    if (!(status.includes('continu') || status.includes('upcoming'))) return false
    const eps = epsByShow[show.id]
    if (!eps) return false // still loading — don't claim anything yet
    return !eps.some((ep) => ep.aired && ep.aired >= fromDate)
  })
}
