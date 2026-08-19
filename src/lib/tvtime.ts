// Parses a TV Time personal-data export into a neutral import plan.
//
// TV Time hands out a ZIP of CSVs whose exact columns have changed over the
// years (and differ per account age), so nothing here hard-codes a schema:
// each file is classified by sniffing its headers against synonym lists, and
// anything unrecognized is reported rather than silently dropped.

import { parseCsv } from './csv'

export interface ImportEpisode {
  s: number
  e: number
  /** Episode id from the export — used as a fallback match. */
  sourceEpisodeId?: number
  /** When it was watched, in ms; undefined when the export has no date. */
  watchedAt?: number
}

export interface ImportShow {
  /** Show id from the export (TV Time is TheTVDB-based, so usually a TVDB id). */
  sourceId?: number
  name?: string
  episodes: ImportEpisode[]
  /** True when the export listed the show but no watched episodes. */
  followOnly: boolean
}

export interface ImportPlan {
  shows: ImportShow[]
  totalEpisodes: number
  files: { name: string; kind: FileKind; rows: number }[]
  warnings: string[]
}

export type FileKind = 'episodes' | 'shows' | 'movies' | 'ignored'

const SHOW_ID_KEYS = [
  'tvdb_id',
  'tvdb_show_id',
  'thetvdb_id',
  'series_id',
  'show_id',
  'tv_show_id',
  'tvshow_id',
  'entity_id',
]
const SHOW_NAME_KEYS = [
  'show_name',
  'tv_show_name',
  'series_name',
  'series_title',
  'show_title',
  'episode_show_name',
  'name',
  'title',
]
const SEASON_KEYS = [
  'season_number',
  'episode_season_number',
  'seasonnumber',
  'season',
  'season_num',
]
const EPISODE_KEYS = [
  'episode_number',
  'episode_episode_number',
  'episodenumber',
  'number',
  'episode_num',
  'episode',
]
const EPISODE_ID_KEYS = ['episode_id', 'tvdb_episode_id', 'thetvdb_episode_id']
const DATE_KEYS = [
  'watched_at',
  'seen_at',
  'date_watched',
  'first_watched',
  'created_at',
  'updated_at',
  'date',
]

/** First header present in `keys`, or undefined. */
function pick(headers: string[], keys: string[]): string | undefined {
  return keys.find((k) => headers.includes(k))
}

function toInt(value: string | undefined): number | undefined {
  if (!value) return undefined
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : undefined
}

function toTimestamp(value: string | undefined): number | undefined {
  if (!value) return undefined
  // Accept ISO, "YYYY-MM-DD HH:MM:SS" (needs a T for Safari), and epoch values.
  const numeric = Number(value)
  if (Number.isFinite(numeric) && value.trim() !== '' && /^\d{10,13}$/.test(value.trim())) {
    return value.trim().length <= 10 ? numeric * 1000 : numeric
  }
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const ms = Date.parse(normalized)
  return Number.isFinite(ms) ? ms : undefined
}

export function classifyHeaders(headers: string[], fileName: string): FileKind {
  const lower = fileName.toLowerCase()
  if (lower.includes('movie')) return 'movies'
  if (!headers.length) return 'ignored'
  const hasSeason = !!pick(headers, SEASON_KEYS)
  const hasEpisode = !!pick(headers, EPISODE_KEYS)
  const hasEpisodeId = !!pick(headers, EPISODE_ID_KEYS)
  if ((hasSeason && hasEpisode) || hasEpisodeId) return 'episodes'
  if (pick(headers, SHOW_ID_KEYS) || pick(headers, SHOW_NAME_KEYS)) return 'shows'
  return 'ignored'
}

interface Bucket {
  sourceId?: number
  name?: string
  episodes: Map<string, ImportEpisode>
  followOnly: boolean
}

function bucketFor(
  buckets: Map<string, Bucket>,
  sourceId: number | undefined,
  name: string | undefined,
): Bucket | null {
  const key = sourceId !== undefined ? `id:${sourceId}` : name ? `name:${name.toLowerCase()}` : ''
  if (!key) return null
  let bucket = buckets.get(key)
  if (!bucket) {
    bucket = { sourceId, name, episodes: new Map(), followOnly: true }
    buckets.set(key, bucket)
  }
  // Fill in whichever identifier this row happens to carry.
  if (bucket.sourceId === undefined && sourceId !== undefined) bucket.sourceId = sourceId
  if (!bucket.name && name) bucket.name = name
  return bucket
}

/**
 * Build an import plan from the CSV files of a TV Time export.
 * Pure and synchronous — the network work happens later, in the executor.
 */
export function buildImportPlan(files: { name: string; text: string }[]): ImportPlan {
  const buckets = new Map<string, Bucket>()
  const fileReport: ImportPlan['files'] = []
  const warnings: string[] = []

  for (const file of files) {
    const short = file.name.split('/').pop() || file.name
    if (!/\.(csv|tsv|txt)$/i.test(short)) {
      fileReport.push({ name: short, kind: 'ignored', rows: 0 })
      continue
    }
    const table = parseCsv(file.text)
    const kind = classifyHeaders(table.headers, short)
    fileReport.push({ name: short, kind, rows: table.rows.length })
    if (kind === 'movies' || kind === 'ignored') continue

    const idKey = pick(table.headers, SHOW_ID_KEYS)
    const nameKey = pick(table.headers, SHOW_NAME_KEYS)
    const seasonKey = pick(table.headers, SEASON_KEYS)
    const episodeKey = pick(table.headers, EPISODE_KEYS)
    const episodeIdKey = pick(table.headers, EPISODE_ID_KEYS)
    const dateKey = pick(table.headers, DATE_KEYS)

    for (const row of table.rows) {
      const sourceId = idKey ? toInt(row[idKey]) : undefined
      const name = nameKey ? row[nameKey] || undefined : undefined
      const bucket = bucketFor(buckets, sourceId, name)
      if (!bucket) continue
      if (kind !== 'episodes') continue

      const s = seasonKey ? toInt(row[seasonKey]) : undefined
      const e = episodeKey ? toInt(row[episodeKey]) : undefined
      const sourceEpisodeId = episodeIdKey ? toInt(row[episodeIdKey]) : undefined
      if (s === undefined || e === undefined) {
        // Without numbers the row is only usable if it carries an episode id.
        if (sourceEpisodeId === undefined) continue
      }
      const key = s !== undefined && e !== undefined ? `${s}x${e}` : `id:${sourceEpisodeId}`
      const watchedAt = dateKey ? toTimestamp(row[dateKey]) : undefined
      const existing = bucket.episodes.get(key)
      if (existing) {
        // Keep the earliest watch date when an export repeats a row.
        if (watchedAt && (!existing.watchedAt || watchedAt < existing.watchedAt)) {
          existing.watchedAt = watchedAt
        }
        continue
      }
      bucket.episodes.set(key, {
        s: s ?? -1,
        e: e ?? -1,
        sourceEpisodeId,
        watchedAt,
      })
      bucket.followOnly = false
    }
  }

  const shows: ImportShow[] = [...buckets.values()]
    .filter((b) => b.sourceId !== undefined || b.name)
    .map((b) => ({
      sourceId: b.sourceId,
      name: b.name,
      episodes: [...b.episodes.values()].sort((x, y) => x.s - y.s || x.e - y.e),
      followOnly: b.followOnly,
    }))
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))

  const totalEpisodes = shows.reduce((sum, s) => sum + s.episodes.length, 0)

  if (!shows.length) {
    warnings.push(
      'No shows found. Make sure this is the TV Time personal-data export (a ZIP of CSV files).',
    )
  }
  const movieFiles = fileReport.filter((f) => f.kind === 'movies').length
  if (movieFiles) {
    warnings.push(
      `Skipped ${movieFiles} movie ${movieFiles === 1 ? 'file' : 'files'} — PanimuTV tracks TV only.`,
    )
  }

  return { shows, totalEpisodes, files: fileReport, warnings }
}
