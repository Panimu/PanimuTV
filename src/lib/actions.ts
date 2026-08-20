// High-level user actions: adding shows to the library and syncing their
// metadata/episodes from TheTVDB.

import { fetchEpisodes, getSeriesExtended, img, pickTranslation } from '../api/tvdb'
import type { SearchResult, SeriesBase, SeriesExtended } from '../api/types'
import { useLibrary } from '../store/library'
import { useSettings } from '../store/settings'
import { USER_STATUS_LABELS, type UserStatus } from '../types'
import { pooled, PRIORITY } from './pool'
import { toast } from './toast'

export interface ShowSeed {
  id: number
  name: string
  slug?: string
  poster?: string
  year?: string
  network?: string
  airStatus?: string
  overview?: string
}

export function seedFromSearch(r: SearchResult): ShowSeed {
  const lang = useSettings.getState().language
  return {
    id: Number(r.tvdb_id),
    name: r.translations?.[lang] || r.translations?.eng || r.name,
    slug: r.slug,
    poster: r.image_url,
    year: r.year,
    network: r.network,
    airStatus: r.status,
    overview: r.overviews?.[lang] || r.overviews?.eng || r.overview,
  }
}

export function seedFromBase(s: SeriesBase): ShowSeed {
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    poster: img(s.image),
    year: s.year,
    airStatus: s.status?.name,
    overview: s.overview,
  }
}

/**
 * Add a show to the library. Upcoming shows default to Plan to Watch,
 * everything else to Watching. Full metadata is enriched asynchronously.
 */
export function trackShow(seed: ShowSeed, status?: UserStatus): void {
  const lib = useLibrary.getState()
  if (!Number.isFinite(seed.id) || seed.id <= 0) return
  if (lib.shows[seed.id]) {
    toast(`“${seed.name}” is already in your shows`)
    return
  }
  const userStatus: UserStatus =
    status ?? ((seed.airStatus ?? '').toLowerCase().includes('upcoming') ? 'planned' : 'watching')
  const now = Date.now()
  lib.add({
    id: seed.id,
    name: seed.name,
    slug: seed.slug,
    poster: seed.poster,
    year: seed.year,
    airStatus: seed.airStatus,
    network: seed.network,
    overview: seed.overview,
    genres: [],
    addedAt: now,
    updatedAt: now,
    userStatus,
    favorite: false,
    watched: {},
  })
  toast(`Added “${seed.name}” to ${USER_STATUS_LABELS[userStatus]}`)
  enrichShow(seed.id).catch(() => {
    /* metadata enrichment is best-effort */
  })
}

/** Fetch extended metadata for a tracked show and merge it into the library. */
export async function enrichShow(id: number, force = false): Promise<void> {
  const ext = await getSeriesExtended(id, force)
  applyExtended(id, ext)
  fetchEpisodes(id, ext.status?.name).catch(() => {
    /* warm the episode cache opportunistically */
  })
}

export function bestArtwork(ext: SeriesExtended, type: number): string | undefined {
  const arts = (ext.artworks ?? []).filter((a) => a.type === type)
  arts.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  return img(arts[0]?.image)
}

export function applyExtended(id: number, ext: SeriesExtended): void {
  const { language } = useSettings.getState()
  const tr = pickTranslation(ext, language)
  const network =
    ext.latestNetwork?.name ??
    ext.originalNetwork?.name ??
    ext.companies?.find((c) => c.companyType?.companyTypeId === 1)?.name
  useLibrary.getState().patch(id, {
    name: tr.name ?? ext.name,
    slug: ext.slug,
    poster: img(ext.image) ?? bestArtwork(ext, 2),
    fanart: bestArtwork(ext, 3),
    year: ext.year,
    airStatus: ext.status?.name,
    network,
    runtime: ext.averageRuntime ?? undefined,
    genres: (ext.genres ?? []).map((g) => g.name),
    overview: tr.overview ?? ext.overview,
    firstAired: ext.firstAired || undefined,
    lastAired: ext.lastAired || undefined,
    nextAired: ext.nextAired || undefined,
    lastSyncedAt: Date.now(),
  })
}

/** Force-refresh a show's metadata and episode list from TheTVDB. */
export async function refreshShow(id: number): Promise<void> {
  const ext = await getSeriesExtended(id, true)
  applyExtended(id, ext)
  await fetchEpisodes(id, ext.status?.name, true)
}

// How long tracked-show metadata (nextAired, status, …) may go unsynced
// before the app refreshes it on launch.
const SYNC_STALE_MS = 24 * 3600_000
const SYNC_STALE_ENDED_MS = 7 * 24 * 3600_000
const SYNC_BATCH_LIMIT = 30

let autoSyncStarted = false

/**
 * Keep the library fresh without manual refreshes: on app launch, re-sync
 * the stalest tracked shows (running shows daily, ended weekly). Best-effort
 * and rate-limited through the request pool; failures are silent — cached
 * data keeps working.
 */
export function autoSyncLibrary(): void {
  if (autoSyncStarted) return
  autoSyncStarted = true
  const now = Date.now()
  const stale = Object.values(useLibrary.getState().shows)
    .filter((show) => {
      const status = (show.airStatus ?? '').toLowerCase()
      const ended = status.includes('end') || status.includes('cancel')
      return now - (show.lastSyncedAt ?? 0) > (ended ? SYNC_STALE_ENDED_MS : SYNC_STALE_MS)
    })
    .sort((a, b) => (a.lastSyncedAt ?? 0) - (b.lastSyncedAt ?? 0))
    .slice(0, SYNC_BATCH_LIMIT)
  for (const show of stale) {
    void pooled(() => enrichShow(show.id, true), PRIORITY.background).catch(() => {
      /* stay on cached data */
    })
  }
}
