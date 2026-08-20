// TheTVDB v4 API client.
//
// Transport: tries the API directly (TheTVDB serves CORS headers), and if the
// browser cannot reach it (network policy, CORS proxy in front, …) it falls
// back to the relative `/tvdb` path that `npm run dev` / `npm run preview`
// proxy to api4.thetvdb.com. Whichever mode works is remembered.
//
// Auth: a project API key is exchanged for a bearer token via POST /login.
// The token is kept in localStorage for ~27 days and refreshed on 401.

import { cacheAge, cacheGet, cachePeek, cacheSet } from './cache'
import type {
  Genre,
  RawEpisode,
  SearchResult,
  SeriesBase,
  SeriesExtended,
  TvdbEnvelope,
} from './types'
import type { Ep } from '../types'
import { useSettings } from '../store/settings'

const DIRECT_BASE = 'https://api4.thetvdb.com/v4'
const PROXY_BASE = '/tvdb'
const MODE_KEY = 'panimu.apimode.v1'
const AUTH_KEY = 'panimu.auth.v1'
const TOKEN_LIFETIME_MS = 27 * 24 * 3600_000

export const ARTWORK_BASE = 'https://artworks.thetvdb.com'

export class TvdbError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type Mode = 'direct' | 'proxy'

function getMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'proxy' ? 'proxy' : 'direct'
  } catch {
    return 'direct'
  }
}

function setMode(mode: Mode): void {
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    /* ignore */
  }
}

const baseFor = (mode: Mode) => (mode === 'direct' ? DIRECT_BASE : PROXY_BASE)

function qs(params?: Record<string, string | undefined>): string {
  if (!params) return ''
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, value)
  }
  const str = search.toString()
  return str ? `?${str}` : ''
}

/**
 * True when a response means "this transport is broken" (e.g. the /tvdb proxy
 * path served by a static host that has no proxy) rather than a real API answer.
 * Real TheTVDB errors come back as JSON; a missing proxy returns HTML/text.
 */
function isTransportFailure(mode: Mode, res: Response): boolean {
  if (mode !== 'proxy') return false
  const contentType = res.headers.get('content-type') ?? ''
  return (
    [403, 404, 405, 500, 501, 502, 503].includes(res.status) && !contentType.includes('json')
  )
}

interface HttpOptions {
  method?: string
  body?: unknown
  token?: string
  params?: Record<string, string | undefined>
}

async function httpJson<T>(path: string, options: HttpOptions = {}): Promise<T> {
  const { method = 'GET', body, token, params } = options
  const preferred = getMode()
  const order: Mode[] = preferred === 'direct' ? ['direct', 'proxy'] : ['proxy', 'direct']

  for (const mode of order) {
    let res: Response
    try {
      res = await fetch(baseFor(mode) + path + qs(params), {
        method,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    } catch {
      // Network/CORS failure — try the other transport.
      continue
    }
    if (isTransportFailure(mode, res)) continue
    if (mode !== preferred) setMode(mode)
    if (!res.ok) {
      let message = `TheTVDB request failed (${res.status})`
      try {
        const json = (await res.json()) as { message?: string }
        if (json?.message) message = `TheTVDB: ${json.message} (${res.status})`
      } catch {
        /* keep default message */
      }
      throw new TvdbError(res.status, message)
    }
    return (await res.json()) as T
  }

  throw new TvdbError(
    0,
    'Could not reach TheTVDB. Check your internet connection — or run the app via `npm run dev` / `npm run preview`, which include a CORS proxy.',
  )
}

// ---------------------------------------------------------------------------
// Auth

interface AuthState {
  token: string
  exp: number
}

function readAuth(): AuthState | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AuthState
    if (typeof parsed?.token !== 'string' || typeof parsed?.exp !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

export function clearAuthToken(): void {
  try {
    localStorage.removeItem(AUTH_KEY)
  } catch {
    /* ignore */
  }
}

let loginPromise: Promise<string> | null = null

async function doLogin(): Promise<string> {
  const { apiKey, pin } = useSettings.getState()
  const key = apiKey.trim()
  if (!key) {
    throw new TvdbError(401, 'No TheTVDB API key configured — add one under Profile → Settings.')
  }
  const body: Record<string, string> = { apikey: key }
  if (pin.trim()) body.pin = pin.trim()
  const json = await httpJson<TvdbEnvelope<{ token: string }>>('/login', {
    method: 'POST',
    body,
  })
  const token = json.data?.token
  if (!token) throw new TvdbError(401, 'TheTVDB login did not return a token — check the API key.')
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify({ token, exp: Date.now() + TOKEN_LIFETIME_MS }))
  } catch {
    /* token just won't be cached */
  }
  return token
}

async function ensureToken(): Promise<string> {
  const auth = readAuth()
  if (auth && auth.exp > Date.now() + 60_000) return auth.token
  if (!loginPromise) {
    loginPromise = doLogin().finally(() => {
      loginPromise = null
    })
  }
  return loginPromise
}

async function apiGet<T>(
  path: string,
  params?: Record<string, string | undefined>,
  retryOn401 = true,
): Promise<TvdbEnvelope<T>> {
  const token = await ensureToken()
  try {
    return await httpJson<TvdbEnvelope<T>>(path, { token, params })
  } catch (err) {
    if (err instanceof TvdbError && err.status === 401 && retryOn401) {
      clearAuthToken()
      return apiGet<T>(path, params, false)
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// Helpers

/** Normalize a TheTVDB artwork reference into an absolute URL. */
export function img(url?: string | null): string | undefined {
  if (!url) return undefined
  if (url.startsWith('http')) return url
  return ARTWORK_BASE + (url.startsWith('/') ? url : `/${url}`)
}

export function pickTranslation(
  ext: SeriesExtended,
  language: string,
): { name?: string; overview?: string } {
  return {
    name: ext.translations?.nameTranslations?.find((t) => t.language === language)?.name,
    overview: ext.translations?.overviewTranslations?.find((t) => t.language === language)
      ?.overview,
  }
}

// ---------------------------------------------------------------------------
// Endpoints

export async function searchSeries(query: string): Promise<SearchResult[]> {
  const env = await apiGet<SearchResult[]>('/search', { query, type: 'series', limit: '40' })
  return env.data ?? []
}

export async function getSeriesExtended(id: number, force = false): Promise<SeriesExtended> {
  const key = `series.${id}.ext`
  if (!force) {
    const hit = cacheGet<SeriesExtended>(key, 24 * 3600_000)
    if (hit) return hit
  }
  const env = await apiGet<SeriesExtended>(`/series/${id}/extended`, { meta: 'translations' })
  cacheSet(key, env.data)
  return env.data
}

/** How long a cached episode list stays fresh, based on the show's status. */
export function episodeTtl(airStatus?: string): number {
  const status = (airStatus ?? '').toLowerCase()
  if (status.includes('end') || status.includes('cancel')) return 7 * 24 * 3600_000
  return 12 * 3600_000
}

/** Read cached episodes without fetching (any age). */
export function peekEpisodes(id: number): Ep[] | null {
  return cachePeek<Ep[]>(`eps.${id}`)
}

/** Age in ms of a show's cached episode list, or null when not cached. */
export function episodesCacheAge(id: number): number | null {
  return cacheAge(`eps.${id}`)
}

/** True when cached episodes exist but have outlived their status-based TTL. */
export function episodesAreStale(id: number, airStatus?: string): boolean {
  const age = episodesCacheAge(id)
  return age !== null && age > episodeTtl(airStatus)
}

function toEp(raw: RawEpisode): Ep {
  const overview = raw.overview
    ? raw.overview.length > 260
      ? `${raw.overview.slice(0, 257)}…`
      : raw.overview
    : undefined
  return {
    id: raw.id,
    s: raw.seasonNumber ?? 0,
    e: raw.number ?? 0,
    name: raw.name ?? '',
    aired: raw.aired || null,
    runtime: raw.runtime ?? null,
    image: img(raw.image),
    overview,
    finale: raw.finaleType || null,
  }
}

const MAX_EPISODE_PAGES = 50
/** Pages requested at once after page 0 — outside the shared pool. */
const EPISODE_PAGE_BURST = 3

const episodesInFlight = new Map<number, Promise<Ep[]>>()

/** Fetch the full aired-order episode list for a series (cached with TTL). */
export async function fetchEpisodes(id: number, airStatus?: string, force = false): Promise<Ep[]> {
  const key = `eps.${id}`
  if (!force) {
    const hit = cacheGet<Ep[]>(key, episodeTtl(airStatus))
    if (hit) return hit
  }
  const running = episodesInFlight.get(id)
  if (running) return running

  const promise = (async () => {
    const getPage = (page: number) =>
      apiGet<{ episodes?: RawEpisode[] }>(`/series/${id}/episodes/default`, {
        page: String(page),
      })

    const first = await getPage(0)
    const out: Ep[] = (first.data?.episodes ?? []).map(toEp)

    // The API reports the total up front, so the remaining pages can be
    // fetched together instead of walked one round-trip at a time. A show's
    // in-window episodes usually sit on the LAST page, which serial paging
    // reaches last. Deliberately NOT pooled(): this runs inside a pooled slot.
    const total = first.links?.total_items
    const size = first.links?.page_size
    const pageCount =
      total && size && size > 0 ? Math.min(MAX_EPISODE_PAGES, Math.ceil(total / size)) : null

    if (pageCount !== null) {
      for (let from = 1; from < pageCount; from += EPISODE_PAGE_BURST) {
        const batch = []
        for (let page = from; page < Math.min(from + EPISODE_PAGE_BURST, pageCount); page++) {
          batch.push(getPage(page))
        }
        for (const env of await Promise.all(batch)) {
          for (const raw of env.data?.episodes ?? []) out.push(toEp(raw))
        }
      }
    } else if (first.links?.next) {
      // Older/odd responses without a total: fall back to the serial walk.
      for (let page = 1; page < MAX_EPISODE_PAGES; page++) {
        const env = await getPage(page)
        for (const raw of env.data?.episodes ?? []) out.push(toEp(raw))
        if (!env.links?.next) break
      }
    }

    out.sort((a, b) => a.s - b.s || a.e - b.e)
    cacheSet(key, out)
    return out
  })().finally(() => {
    episodesInFlight.delete(id)
  })

  episodesInFlight.set(id, promise)
  return promise
}

export interface FilterOpts {
  sort?: 'score' | 'firstAired' | 'lastAired' | 'name'
  sortType?: 'asc' | 'desc'
  /** 1 = Continuing, 2 = Ended, 3 = Upcoming */
  status?: '1' | '2' | '3'
  year?: string
  genre?: string
  company?: string
}

export async function filterSeries(opts: FilterOpts): Promise<SeriesBase[]> {
  const { country, language } = useSettings.getState()
  const params: Record<string, string | undefined> = {
    country: country || 'usa',
    lang: language || 'eng',
    ...opts,
  }
  const key =
    'filter.' +
    Object.entries(params)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join('&')
  const hit = cacheGet<SeriesBase[]>(key, 6 * 3600_000)
  if (hit) return hit
  const env = await apiGet<SeriesBase[]>('/series/filter', params)
  const data = env.data ?? []
  cacheSet(key, data)
  return data
}

export async function getGenres(): Promise<Genre[]> {
  const hit = cacheGet<Genre[]>('genres', 30 * 24 * 3600_000)
  if (hit) return hit
  const env = await apiGet<Genre[]>('/genres')
  const data = env.data ?? []
  cacheSet('genres', data)
  return data
}
