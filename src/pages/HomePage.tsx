// Watch Next: the next unwatched episode of every show you're watching,
// plus a strip of what's airing over the coming week.

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconCheck, IconClock, IconCompass } from '../components/Icons'
import { PosterImg } from '../components/PosterImg'
import { addDays, relTime, todayISO } from '../lib/dates'
import {
  epCode,
  episodesLeft,
  finaleLabel,
  lastActivityTs,
  nextUp,
  premiereLabel,
} from '../lib/episodes'
import { isStale } from '../lib/staleness'
import { toast } from '../lib/toast'
import { useEpisodesMap } from '../lib/useEpisodes'
import { useSchedule } from '../lib/useSchedule'
import { useLibrary } from '../store/library'
import { useSettings } from '../store/settings'
import type { TrackedShow } from '../types'

type NextMode = 'likely' | 'all'

export function HomePage() {
  const shows = useLibrary((s) => s.shows)
  const setWatched = useLibrary((s) => s.setWatched)
  const scheduleStatuses = useSettings((s) => s.scheduleStatuses)

  const all = useMemo(() => Object.values(shows), [shows])
  const watching = useMemo(() => all.filter((s) => s.userStatus === 'watching'), [all])
  const scheduled = useMemo(
    () => all.filter((s) => scheduleStatuses.includes(s.userStatus)),
    [all, scheduleStatuses],
  )
  const today = todayISO()

  // "Up next" genuinely needs each watched show's full episode list; the week
  // strip only needs the next seven days, so it uses the day-first loader.
  const { map, loading, errors } = useEpisodesMap(watching)
  const weekEnd = useMemo(() => addDays(today, 7), [today])
  const { days: weekDays } = useSchedule(scheduled, today, weekEnd, today)

  const [nextMode, setNextMode] = useState<NextMode>('likely')

  const upNextAll = useMemo(
    () =>
      watching
        .filter((show) => map[show.id])
        .map((show) => ({
          show,
          ep: nextUp(show.watched, map[show.id], today),
          left: episodesLeft(show.watched, map[show.id], today),
          stale: isStale(show, map[show.id], today),
        }))
        .filter((x): x is { show: TrackedShow; ep: NonNullable<ReturnType<typeof nextUp>>; left: number; stale: boolean } => x.ep !== null)
        .sort((a, b) => lastActivityTs(b.show) - lastActivityTs(a.show)),
    [watching, map, today],
  )

  const staleCount = useMemo(() => upNextAll.filter((x) => x.stale).length, [upNextAll])
  const upNext = useMemo(
    () => (nextMode === 'likely' ? upNextAll.filter((x) => !x.stale) : upNextAll),
    [upNextAll, nextMode],
  )

  const weekItems = useMemo(
    () =>
      weekDays.flatMap((day) =>
        day.entries
          .map((entry) => ({ show: shows[entry.showId], ep: entry.ep, date: day.date }))
          .filter((item) => item.show),
      ),
    [weekDays, shows],
  )

  if (!all.length) {
    return (
      <div className="page">
        <div className="empty-hero">
          <div className="empty-hero-mark">📺</div>
          <h1>Welcome to PanimuTV</h1>
          <p>
            Track what you're watching, see every upcoming episode in one scrollable release
            list, and discover what to watch next — all stored right here in your browser.
          </p>
          <Link to="/discover" className="btn btn-accent">
            <IconCompass size={18} /> Find your first show
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <h1 className="page-title">Watch Next</h1>

      {weekItems.length > 0 && (
        <section className="section">
          <h2 className="section-title">
            <IconClock size={16} /> Coming up this week
          </h2>
          <div className="hscroll">
            {weekItems.map(({ show, ep, date }) => (
              <Link key={`${show.id}-${ep.id}`} to={`/show/${show.id}`} className="week-card">
                <PosterImg src={show.poster} alt={show.name} className="poster week-poster" />
                <div className="week-card-body">
                  <div className="week-card-show">{show.name}</div>
                  <div className="week-card-ep">{epCode(ep)}</div>
                  <div className="week-card-date">{relTime(date, today)}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="page-head">
          <h2 className="section-title">Up next for you</h2>
          {upNextAll.length > 0 && (
            <div className="chip-row next-mode-row">
              <button
                className={`chip chip-btn ${nextMode === 'likely' ? 'chip-active' : ''}`}
                aria-pressed={nextMode === 'likely'}
                onClick={() => setNextMode('likely')}
                title="Hide shows you appear to have stopped watching"
              >
                Likely
                {staleCount > 0 && <span className="chip-count">{upNextAll.length - staleCount}</span>}
              </button>
              <button
                className={`chip chip-btn ${nextMode === 'all' ? 'chip-active' : ''}`}
                aria-pressed={nextMode === 'all'}
                onClick={() => setNextMode('all')}
                title="Show every show with an unwatched episode, including stale ones"
              >
                All
                <span className="chip-count">{upNextAll.length}</span>
              </button>
            </div>
          )}
        </div>

        {loading && !upNextAll.length && <div className="hint">Loading your episodes…</div>}
        {errors > 0 && (
          <div className="notice">
            Couldn't refresh {errors} show{errors > 1 ? 's' : ''} — showing what's cached.
          </div>
        )}

        {!loading && watching.length === 0 && (
          <div className="empty-block">
            <p>You're not watching anything right now.</p>
            <Link to="/discover" className="btn">
              Browse Discover
            </Link>
          </div>
        )}

        {!loading && watching.length > 0 && upNextAll.length === 0 && (
          <div className="empty-block">
            <p>🎉 You're all caught up! Check the schedule for what's coming.</p>
            <Link to="/schedule" className="btn">
              View schedule
            </Link>
          </div>
        )}

        {!loading && upNextAll.length > 0 && upNext.length === 0 && (
          <div className="empty-block">
            <p>
              Nothing likely right now — {staleCount} show{staleCount === 1 ? '' : 's'} with new
              episodes {staleCount === 1 ? "hasn't" : "haven't"} been watched in a while.
            </p>
            <button className="btn" onClick={() => setNextMode('all')}>
              Show all {upNextAll.length}
            </button>
          </div>
        )}

        <div className="upnext-list">
          {upNext.map(({ show, ep, left, stale }) => {
            const badge = premiereLabel(ep) ?? finaleLabel(ep)
            return (
              <div key={show.id} className={`upnext-card ${stale ? 'upnext-stale' : ''}`}>
                <Link to={`/show/${show.id}`} className="upnext-poster">
                  <PosterImg src={show.poster} alt={show.name} className="poster" />
                </Link>
                <div className="upnext-info">
                  <Link to={`/show/${show.id}`} className="upnext-show">
                    {show.name}
                  </Link>
                  <div className="upnext-ep">
                    <span className="chip chip-accent">{epCode(ep)}</span>
                    <span className="upnext-ep-name">{ep.name || 'TBA'}</span>
                  </div>
                  <div className="upnext-meta">
                    {ep.aired && <span>{relTime(ep.aired, today)}</span>}
                    {left > 1 && <span>· {left} episodes left</span>}
                    {badge && <span className="chip chip-outline">{badge}</span>}
                    {stale && (
                      <span className="chip chip-stale" title="No new episodes watched in a while">
                        Stale
                      </span>
                    )}
                  </div>
                </div>
                <button
                  className="check-btn"
                  title="Mark watched"
                  aria-label={`Mark ${epCode(ep)} of ${show.name} watched`}
                  onClick={() => {
                    setWatched(show.id, [ep.id], true)
                    toast(`${show.name} ${epCode(ep)} marked watched`)
                  }}
                >
                  <IconCheck size={22} />
                </button>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
