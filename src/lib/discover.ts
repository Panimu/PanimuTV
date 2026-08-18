// Discovery feeds built on TheTVDB's /series/filter endpoint, plus a simple
// genre-affinity recommender seeded from the user's own library.

import { filterSeries, getGenres } from '../api/tvdb'
import type { SeriesBase } from '../api/types'
import { todayISO } from './dates'
import type { TrackedShow } from '../types'

/** Popular shows that are currently airing. */
export function trendingNow(): Promise<SeriesBase[]> {
  return filterSeries({ status: '1', sort: 'score', sortType: 'desc' })
}

/** Announced shows, dated premieres first (soonest first), undated after. */
export async function comingSoon(): Promise<SeriesBase[]> {
  const raw = await filterSeries({ status: '3', sort: 'score', sortType: 'desc' })
  const today = todayISO()
  const dated = raw
    .filter((s) => s.firstAired && s.firstAired >= today)
    .sort((a, b) => a.firstAired!.localeCompare(b.firstAired!))
  const undated = raw.filter((s) => !s.firstAired || s.firstAired < today)
  return [...dated, ...undated]
}

export function newThisYear(): Promise<SeriesBase[]> {
  return filterSeries({ year: String(new Date().getFullYear()), sort: 'score', sortType: 'desc' })
}

export function topRated(): Promise<SeriesBase[]> {
  return filterSeries({ sort: 'score', sortType: 'desc' })
}

/**
 * The user's strongest genres, weighted by how much of each show they have
 * actually watched. Dropped shows don't count.
 */
export function topGenresOf(shows: TrackedShow[], n = 2): string[] {
  const counts = new Map<string, number>()
  for (const show of shows) {
    if (show.userStatus === 'dropped') continue
    const weight = 1 + Object.keys(show.watched).length / 10
    for (const genre of show.genres) {
      counts.set(genre, (counts.get(genre) ?? 0) + weight)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([genre]) => genre)
}

export async function byGenreName(name: string): Promise<SeriesBase[]> {
  const genres = await getGenres()
  const match = genres.find((g) => g.name.toLowerCase() === name.toLowerCase())
  if (!match) return []
  return filterSeries({ genre: String(match.id), sort: 'score', sortType: 'desc' })
}
