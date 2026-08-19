// Executes an import plan against TheTVDB and the local library.
//
// Resolution strategy per show: trust the export's id first (TV Time ids are
// TheTVDB ids), verify it by actually fetching the series, and fall back to a
// name search when that fails. Episodes match on season/episode number, with
// the export's episode id as a secondary match.

import { fetchEpisodes, getSeriesExtended, searchSeries } from '../api/tvdb'
import type { SearchResult } from '../api/types'
import { useLibrary } from '../store/library'
import { todayISO } from './dates'
import { hasAired, isRegular } from './episodes'
import { applyExtended } from './actions'
import { pooled } from './pool'
import { searchResultScore } from './titleMatch'
import type { ImportPlan, ImportShow } from './tvtime'
import type { Ep, TrackedShow, UserStatus } from '../types'

export interface ImportProgress {
  done: number
  total: number
  current: string
}

export interface ImportResult {
  showsAdded: number
  showsUpdated: number
  episodesMarked: number
  /** Shows resolved by title search rather than by id — worth eyeballing. */
  matchedByName: string[]
  unmatched: string[]
  errors: string[]
}

/** Pick a library status from what the user has actually watched. */
function inferStatus(
  existing: TrackedShow | undefined,
  eps: Ep[],
  watched: Record<number, number>,
  airStatus?: string,
): UserStatus {
  // Never override a status the user has already chosen for themselves.
  if (existing) return existing.userStatus
  const count = Object.keys(watched).length
  if (count === 0) return 'planned'
  const today = todayISO()
  const aired = eps.filter((ep) => isRegular(ep) && hasAired(ep, today))
  const allSeen = aired.length > 0 && aired.every((ep) => watched[ep.id] !== undefined)
  const ended = (airStatus ?? '').toLowerCase()
  if (allSeen && (ended.includes('end') || ended.includes('cancel'))) return 'completed'
  return 'watching'
}

/**
 * Titles must score at least this against a candidate's name, a translation,
 * or an alias before a search match is trusted on its own. High enough to
 * reject "24" → "24 Hours in A&E" (0.65), low enough to accept partial
 * titles like "Deep Space Nine" → "Star Trek: Deep Space Nine" (0.78) and
 * qualifier variants like "The Office" → "The Office (US)" (0.95).
 */
const STRONG_TITLE_MATCH = 0.75

/**
 * Choose a search result for a title, or null if none is trustworthy.
 * The best-scoring candidate wins when it clears STRONG_TITLE_MATCH.
 * Below that, evidence the user actually watched episodes justifies a
 * looser pick — the best partial match if any titles relate at all,
 * otherwise the API's top relevance hit. A follow-only entry with no
 * strong match stays unmatched rather than risk importing the wrong show.
 */
export function pickSearchResult(
  results: SearchResult[],
  title: string,
  hasWatchEvidence: boolean,
): SearchResult | null {
  const candidates = results.filter((r) => r.type === 'series' && Number(r.tvdb_id) > 0)
  if (!candidates.length) return null

  let best: SearchResult | null = null
  let bestScore = 0
  for (const candidate of candidates) {
    const score = searchResultScore(candidate, title)
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }

  if (best && bestScore >= STRONG_TITLE_MATCH) return best
  if (hasWatchEvidence) return bestScore > 0 && best ? best : candidates[0]
  return null
}

async function resolveSeriesId(show: ImportShow): Promise<{ id: number; byName: boolean } | null> {
  if (show.sourceId !== undefined && show.sourceId > 0) {
    try {
      await getSeriesExtended(show.sourceId)
      return { id: show.sourceId, byName: false }
    } catch {
      // Fall through to a title search.
    }
  }
  if (show.name) {
    const results = await searchSeries(show.name)
    const match = pickSearchResult(results, show.name, show.episodes.length > 0)
    if (match) return { id: Number(match.tvdb_id), byName: true }
  }
  return null
}

async function importOne(show: ImportShow, result: ImportResult): Promise<void> {
  const label = show.name ?? `#${show.sourceId}`
  const resolved = await resolveSeriesId(show)
  if (!resolved) {
    result.unmatched.push(label)
    return
  }
  const { id, byName } = resolved
  if (byName) result.matchedByName.push(label)

  const ext = await getSeriesExtended(id)
  const lib = useLibrary.getState()
  const existing = lib.shows[id]

  if (!existing) {
    const now = Date.now()
    lib.add({
      id,
      name: ext.name,
      genres: [],
      addedAt: now,
      updatedAt: now,
      userStatus: 'watching',
      favorite: false,
      watched: {},
    })
    applyExtended(id, ext)
    result.showsAdded++
  } else {
    result.showsUpdated++
  }

  if (!show.episodes.length) {
    // Followed but unwatched: leave it as a plan-to-watch entry.
    if (!existing) useLibrary.getState().setStatus(id, 'planned')
    return
  }

  const eps = await fetchEpisodes(id, ext.status?.name)
  const byNumber = new Map<string, Ep>()
  const byId = new Map<number, Ep>()
  for (const ep of eps) {
    byNumber.set(`${ep.s}x${ep.e}`, ep)
    byId.set(ep.id, ep)
  }

  const watched: Record<number, number> = {}
  for (const item of show.episodes) {
    const match =
      byNumber.get(`${item.s}x${item.e}`) ??
      (item.sourceEpisodeId !== undefined ? byId.get(item.sourceEpisodeId) : undefined)
    if (!match) continue
    watched[match.id] = item.watchedAt ?? Date.now()
  }

  const marked = Object.keys(watched).length
  if (marked) {
    useLibrary.getState().mergeWatched(id, watched)
    result.episodesMarked += marked
  }
  const after = useLibrary.getState().shows[id]
  if (after) {
    const status = inferStatus(existing, eps, after.watched, ext.status?.name)
    if (status !== after.userStatus) useLibrary.getState().setStatus(id, status)
  }
}

/** Run an import plan, reporting progress as each show completes. */
export async function runImport(
  plan: ImportPlan,
  onProgress?: (progress: ImportProgress) => void,
): Promise<ImportResult> {
  const result: ImportResult = {
    showsAdded: 0,
    showsUpdated: 0,
    episodesMarked: 0,
    matchedByName: [],
    unmatched: [],
    errors: [],
  }
  const total = plan.shows.length
  let done = 0

  await Promise.all(
    plan.shows.map((show) =>
      pooled(async () => {
        try {
          await importOne(show, result)
        } catch (err) {
          const label = show.name ?? `#${show.sourceId}`
          result.errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`)
        } finally {
          done++
          onProgress?.({ done, total, current: show.name ?? '' })
        }
      }),
    ),
  )

  return result
}
