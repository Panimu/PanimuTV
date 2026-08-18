// Library statistics, computed from the persisted library plus whatever
// episode lists are already in the local cache (no network needed).

import type { Ep, TrackedShow, UserStatus } from '../types'

const FALLBACK_RUNTIME_MIN = 40

export interface MonthBucket {
  key: string
  label: string
  count: number
}

export interface Stats {
  totalShows: number
  byStatus: Record<UserStatus, number>
  favorites: number
  episodesWatched: number
  minutesWatched: number
  thisMonth: number
  thisYear: number
  topGenres: { name: string; count: number }[]
  topShows: { show: TrackedShow; count: number }[]
  months: MonthBucket[]
}

export function computeStats(
  shows: TrackedShow[],
  epsByShow: Record<number, Ep[] | null | undefined>,
  now = new Date(),
): Stats {
  const byStatus: Record<UserStatus, number> = {
    watching: 0,
    planned: 0,
    onhold: 0,
    completed: 0,
    dropped: 0,
  }
  let favorites = 0
  let episodesWatched = 0
  let minutesWatched = 0
  let thisMonth = 0
  let thisYear = 0

  const genreCounts = new Map<string, number>()
  const perShow: { show: TrackedShow; count: number }[] = []

  // Last 12 months, oldest first.
  const months: MonthBucket[] = []
  const monthIndex = new Map<string, number>()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthIndex.set(key, months.length)
    months.push({
      key,
      label: d.toLocaleDateString(undefined, { month: 'short' }),
      count: 0,
    })
  }

  for (const show of shows) {
    byStatus[show.userStatus]++
    if (show.favorite) favorites++

    const watchedIds = Object.keys(show.watched)
    const count = watchedIds.length
    episodesWatched += count
    if (count > 0) perShow.push({ show, count })

    const runtimeById = new Map<number, number>()
    for (const ep of epsByShow[show.id] ?? []) {
      if (ep.runtime) runtimeById.set(ep.id, ep.runtime)
    }
    for (const idStr of watchedIds) {
      minutesWatched +=
        runtimeById.get(Number(idStr)) ?? show.runtime ?? FALLBACK_RUNTIME_MIN
    }

    for (const ts of Object.values(show.watched)) {
      const d = new Date(ts)
      if (d.getFullYear() === now.getFullYear()) {
        thisYear++
        if (d.getMonth() === now.getMonth()) thisMonth++
      }
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const idx = monthIndex.get(key)
      if (idx !== undefined) months[idx].count++
    }

    if (show.userStatus !== 'dropped') {
      const weight = Math.max(1, count)
      for (const genre of show.genres) {
        genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + weight)
      }
    }
  }

  return {
    totalShows: shows.length,
    byStatus,
    favorites,
    episodesWatched,
    minutesWatched,
    thisMonth,
    thisYear,
    topGenres: [...genreCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
    topShows: perShow.sort((a, b) => b.count - a.count).slice(0, 5),
    months,
  }
}
