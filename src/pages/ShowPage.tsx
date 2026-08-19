// Show detail: artwork header, tracking controls, and season-by-season
// episode list with per-episode / per-season / watch-up-to-here marking.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getSeriesExtended, img, pickTranslation } from '../api/tvdb'
import type { SeriesExtended } from '../api/types'
import {
  IconCheck,
  IconChecks,
  IconChevronDown,
  IconChevronRight,
  IconExternal,
  IconRefresh,
  IconStar,
  IconTrash,
} from '../components/Icons'
import { PosterImg } from '../components/PosterImg'
import { ProgressBar } from '../components/ProgressBar'
import { bestArtwork, trackShow, type ShowSeed } from '../lib/actions'
import { fmtDate, relTime, todayISO } from '../lib/dates'
import {
  epCode,
  epsUpTo,
  finaleLabel,
  hasAired,
  isRegular,
  nextUp,
  premiereLabel,
  progressOf,
  sortEps,
} from '../lib/episodes'
import { toast } from '../lib/toast'
import { useEpisodes } from '../lib/useEpisodes'
import { useLibrary } from '../store/library'
import { useSettings } from '../store/settings'
import {
  USER_STATUS_LABELS,
  USER_STATUS_ORDER,
  type Ep,
  type UserStatus,
} from '../types'

export function ShowPage() {
  const params = useParams()
  const showId = Number(params.id)
  const validId = Number.isFinite(showId) && showId > 0

  const tracked = useLibrary((s) => s.shows[showId])
  const setStatus = useLibrary((s) => s.setStatus)
  const toggleFavorite = useLibrary((s) => s.toggleFavorite)
  const setRating = useLibrary((s) => s.setRating)
  const setWatched = useLibrary((s) => s.setWatched)
  const remove = useLibrary((s) => s.remove)
  const language = useSettings((s) => s.language)

  const [ext, setExt] = useState<SeriesExtended | null>(null)
  const [extError, setExtError] = useState<string | null>(null)

  useEffect(() => {
    if (!validId) return
    let alive = true
    setExt(null)
    setExtError(null)
    getSeriesExtended(showId)
      .then((data) => {
        if (alive) setExt(data)
      })
      .catch((err) => {
        if (alive) setExtError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      alive = false
    }
  }, [showId, validId])

  const airStatus = tracked?.airStatus ?? ext?.status?.name
  const { eps, loading: epsLoading, error: epsError, refresh } = useEpisodes(
    validId ? showId : undefined,
    airStatus,
  )

  const today = todayISO()

  const view = useMemo(() => {
    const tr = ext ? pickTranslation(ext, language) : {}
    return {
      name: tracked?.name ?? tr.name ?? ext?.name ?? `Show #${showId}`,
      poster: tracked?.poster ?? (ext ? img(ext.image) ?? bestArtwork(ext, 2) : undefined),
      fanart: tracked?.fanart ?? (ext ? bestArtwork(ext, 3) : undefined),
      overview: tracked?.overview ?? tr.overview ?? ext?.overview,
      year: tracked?.year ?? ext?.year,
      network:
        tracked?.network ?? ext?.latestNetwork?.name ?? ext?.originalNetwork?.name,
      airStatus: airStatus,
      runtime: tracked?.runtime ?? ext?.averageRuntime ?? undefined,
      genres: tracked?.genres.length ? tracked.genres : (ext?.genres ?? []).map((g) => g.name),
      firstAired: tracked?.firstAired ?? ext?.firstAired,
      nextAired: ext?.nextAired || tracked?.nextAired,
      score: ext?.score,
      slug: tracked?.slug ?? ext?.slug,
    }
  }, [tracked, ext, language, showId, airStatus])

  const seed: ShowSeed = useMemo(
    () => ({
      id: showId,
      name: view.name,
      slug: view.slug,
      poster: view.poster,
      year: view.year,
      network: view.network,
      airStatus: view.airStatus,
      overview: view.overview,
    }),
    [showId, view],
  )

  const seasons = useMemo(() => {
    if (!eps) return []
    const bySeason = new Map<number, Ep[]>()
    for (const ep of sortEps(eps)) {
      const list = bySeason.get(ep.s)
      if (list) list.push(ep)
      else bySeason.set(ep.s, [ep])
    }
    // Specials (season 0) go last.
    const numbers = [...bySeason.keys()].sort((a, b) =>
      a === 0 ? 1 : b === 0 ? -1 : a - b,
    )
    return numbers.map((n) => ({ n, eps: bySeason.get(n)! }))
  }, [eps])

  // Auto-open the most relevant season once per show; never fight the user's
  // own toggling after that (background refetches must not reset it).
  const [openSeason, setOpenSeason] = useState<number | null>(null)
  const autoOpenedForRef = useRef<number | null>(null)
  useEffect(() => {
    if (!eps || !eps.length) return
    if (autoOpenedForRef.current === showId) return
    autoOpenedForRef.current = showId
    const next = tracked ? nextUp(tracked.watched, eps, today) : null
    const regulars = eps.filter(isRegular)
    const fallback = regulars.length ? regulars[regulars.length - 1].s : eps[eps.length - 1].s
    setOpenSeason(next ? next.s : fallback)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eps, showId])

  const progress = tracked && eps ? progressOf(tracked.watched, eps, today) : null

  if (!validId) {
    return (
      <div className="page">
        <div className="empty-block">
          <p>That show link doesn't look right.</p>
          <Link to="/discover" className="btn">
            Back to Discover
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page show-page">
      {view.fanart && (
        <div className="show-hero" style={{ backgroundImage: `url(${view.fanart})` }} />
      )}

      <div className="show-head">
        <PosterImg src={view.poster} alt={view.name} className="poster show-poster" />
        <div className="show-head-info">
          <h1 className="show-title">{view.name}</h1>
          <div className="show-chips">
            {view.year && <span className="chip">{view.year}</span>}
            {view.airStatus && <span className="chip">{view.airStatus}</span>}
            {view.network && <span className="chip">{view.network}</span>}
            {view.runtime ? <span className="chip">{view.runtime} min</span> : null}
            {typeof view.score === 'number' && view.score > 0 && (
              <span className="chip" title="TheTVDB popularity score">
                ♥ {Intl.NumberFormat().format(Math.round(view.score))}
              </span>
            )}
          </div>
          {view.genres.length > 0 && (
            <div className="show-genres">{view.genres.join(' · ')}</div>
          )}

          {!tracked ? (
            <div className="show-actions">
              <button className="btn btn-accent" onClick={() => trackShow(seed, 'watching')}>
                + Watch now
              </button>
              <button className="btn" onClick={() => trackShow(seed, 'planned')}>
                Plan to watch
              </button>
            </div>
          ) : (
            <div className="show-actions">
              <label className="field-inline">
                <select
                  value={tracked.userStatus}
                  onChange={(e) => {
                    setStatus(showId, e.target.value as UserStatus)
                    toast(`Moved to ${USER_STATUS_LABELS[e.target.value as UserStatus]}`)
                  }}
                >
                  {USER_STATUS_ORDER.map((status) => (
                    <option key={status} value={status}>
                      {USER_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className={`btn btn-icon ${tracked.favorite ? 'btn-fav' : ''}`}
                title={tracked.favorite ? 'Unfavorite' : 'Favorite'}
                onClick={() => toggleFavorite(showId)}
              >
                <IconStar size={18} filled={tracked.favorite} />
              </button>
              <label className="field-inline">
                <select
                  value={tracked.rating ?? ''}
                  onChange={(e) =>
                    setRating(showId, e.target.value ? Number(e.target.value) : undefined)
                  }
                  title="Your rating"
                >
                  <option value="">Rate…</option>
                  {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n} / 10
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="btn btn-icon btn-danger"
                title="Remove from my shows"
                onClick={() => {
                  if (window.confirm(`Remove “${view.name}” and its watch history?`)) {
                    remove(showId)
                    toast(`Removed “${view.name}”`)
                  }
                }}
              >
                <IconTrash size={17} />
              </button>
            </div>
          )}

          {progress && progress.aired > 0 && (
            <div className="show-progress">
              <ProgressBar value={progress.pct} />
              <span className="show-progress-label">
                {progress.watched}/{progress.aired} aired episodes watched
                {progress.total > progress.aired &&
                  ` · ${progress.total - progress.aired} upcoming`}
              </span>
            </div>
          )}

          {view.nextAired && view.nextAired >= today && (
            <div className="next-aired">
              Next episode {relTime(view.nextAired, today)} ({fmtDate(view.nextAired)})
            </div>
          )}
        </div>
      </div>

      {extError && <div className="notice">{extError}</div>}

      {view.overview && <p className="show-overview">{view.overview}</p>}

      <div className="show-meta-row">
        {view.firstAired && <span>First aired {fmtDate(view.firstAired)}</span>}
        {view.slug && (
          <a
            href={`https://thetvdb.com/series/${view.slug}`}
            target="_blank"
            rel="noreferrer"
            className="ext-link"
          >
            TheTVDB <IconExternal size={13} />
          </a>
        )}
        <button className="btn btn-small" onClick={() => void refresh()} disabled={epsLoading}>
          <IconRefresh size={14} /> {epsLoading ? 'Refreshing…' : 'Refresh episodes'}
        </button>
      </div>

      <section className="section">
        <h2 className="section-title">Episodes</h2>
        {epsLoading && !eps && <div className="hint">Loading episodes…</div>}
        {epsError && <div className="notice">{epsError}</div>}
        {eps && !eps.length && <div className="hint">No episodes listed yet.</div>}

        {seasons.map(({ n, eps: seasonEps }) => (
          <SeasonBlock
            key={n}
            seasonNumber={n}
            eps={seasonEps}
            allEps={eps ?? []}
            open={openSeason === n}
            onToggle={() => setOpenSeason(openSeason === n ? null : n)}
            watched={tracked?.watched}
            today={today}
            onSetWatched={
              tracked ? (ids, value) => setWatched(showId, ids, value) : undefined
            }
          />
        ))}
      </section>
    </div>
  )
}

interface SeasonBlockProps {
  seasonNumber: number
  eps: Ep[]
  allEps: Ep[]
  open: boolean
  onToggle: () => void
  watched?: Record<number, number>
  today: string
  onSetWatched?: (ids: number[], value: boolean) => void
}

function SeasonBlock({
  seasonNumber,
  eps,
  allEps,
  open,
  onToggle,
  watched,
  today,
  onSetWatched,
}: SeasonBlockProps) {
  const aired = eps.filter((ep) => hasAired(ep, today))
  const watchedCount = watched ? aired.filter((ep) => watched[ep.id] !== undefined).length : 0
  const allWatched = aired.length > 0 && watchedCount === aired.length
  const title = seasonNumber === 0 ? 'Specials' : `Season ${seasonNumber}`

  return (
    <div className="season">
      <div className="season-head">
        <button className="season-toggle" onClick={onToggle} aria-expanded={open}>
          {open ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
          <span className="season-name">{title}</span>
          <span className="season-count">
            {aired.length === 0
              ? `${eps.length} upcoming`
              : watched
                ? `${watchedCount}/${aired.length} watched`
                : `${eps.length} episodes`}
            {aired.length > 0 &&
              eps.length > aired.length &&
              ` · ${eps.length - aired.length} upcoming`}
          </span>
        </button>
        {onSetWatched && aired.length > 0 && (
          <button
            className="btn btn-small"
            onClick={() =>
              onSetWatched(
                aired.map((ep) => ep.id),
                !allWatched,
              )
            }
          >
            {allWatched ? 'Unmark season' : 'Mark season watched'}
          </button>
        )}
      </div>
      {open && (
        <ul className="ep-list">
          {eps.map((ep) => (
            <EpisodeRow
              key={ep.id}
              ep={ep}
              allEps={allEps}
              watchedAt={watched?.[ep.id]}
              trackable={!!onSetWatched}
              today={today}
              onSetWatched={onSetWatched}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

interface EpisodeRowProps {
  ep: Ep
  allEps: Ep[]
  watchedAt?: number
  trackable: boolean
  today: string
  onSetWatched?: (ids: number[], value: boolean) => void
}

function EpisodeRow({ ep, allEps, watchedAt, trackable, today, onSetWatched }: EpisodeRowProps) {
  const [expanded, setExpanded] = useState(false)
  const aired = hasAired(ep, today)
  const isWatched = watchedAt !== undefined
  const badge = premiereLabel(ep) ?? finaleLabel(ep)

  return (
    <li className={`ep-row ${aired ? '' : 'ep-unaired'} ${isWatched ? 'ep-watched' : ''}`}>
      <span className="ep-num">{ep.e}</span>
      <button
        className="ep-main"
        onClick={() => setExpanded((v) => !v)}
        title={ep.overview ? 'Show overview' : undefined}
      >
        <span className="ep-name">{ep.name || epCode(ep)}</span>
        <span className="ep-sub">
          {ep.aired ? (aired ? fmtDate(ep.aired) : relTime(ep.aired, today)) : 'TBA'}
          {ep.runtime ? ` · ${ep.runtime}m` : ''}
          {badge && <span className="chip chip-outline chip-tiny">{badge}</span>}
        </span>
        {expanded && ep.overview && <span className="ep-overview">{ep.overview}</span>}
      </button>
      {trackable && onSetWatched && isRegular(ep) && aired && !isWatched && (
        <button
          className="ep-upto"
          title="Mark this and everything before it watched"
          aria-label={`Mark up to ${epCode(ep)} watched`}
          onClick={() =>
            onSetWatched(
              epsUpTo(allEps, ep, today).map((e) => e.id),
              true,
            )
          }
        >
          <IconChecks size={16} />
        </button>
      )}
      {trackable && onSetWatched && (
        <button
          className={`ep-check ${isWatched ? 'checked' : ''}`}
          disabled={!aired && !isWatched}
          title={isWatched ? 'Mark unwatched' : aired ? 'Mark watched' : 'Not aired yet'}
          aria-label={`${isWatched ? 'Unmark' : 'Mark'} ${epCode(ep)} watched`}
          onClick={() => onSetWatched([ep.id], !isWatched)}
        >
          <IconCheck size={16} />
        </button>
      )}
    </li>
  )
}
