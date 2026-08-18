// Builds the scrollable release list: tracked shows' episodes grouped by day.

import type { Ep, TrackedShow } from '../types'

export interface ScheduleItem {
  show: TrackedShow
  ep: Ep
}

export interface ScheduleGroup {
  date: string
  items: ScheduleItem[]
}

export function buildSchedule(
  shows: TrackedShow[],
  epsByShow: Record<number, Ep[]>,
  start: string,
  end: string,
): ScheduleGroup[] {
  const byDate = new Map<string, ScheduleItem[]>()
  for (const show of shows) {
    for (const ep of epsByShow[show.id] ?? []) {
      if (!ep.aired || ep.aired < start || ep.aired > end) continue
      const list = byDate.get(ep.aired)
      if (list) list.push({ show, ep })
      else byDate.set(ep.aired, [{ show, ep }])
    }
  }
  return [...byDate.entries()]
    .map(([date, items]) => ({
      date,
      items: items.sort(
        (a, b) =>
          a.show.name.localeCompare(b.show.name) || a.ep.s - b.ep.s || a.ep.e - b.ep.e,
      ),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
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
