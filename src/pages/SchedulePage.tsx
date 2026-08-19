// Schedule: one scrollable release list of every episode from your tracked
// shows — recent past through upcoming — grouped by day with a Today anchor.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconCheck, IconRefresh } from '../components/Icons'
import { PosterImg } from '../components/PosterImg'
import { refreshShow } from '../lib/actions'
import { addDays, fmtDayHeading, relTime, todayISO } from '../lib/dates'
import { epCode, finaleLabel, premiereLabel } from '../lib/episodes'
import { pooled } from '../lib/pool'
import { buildSchedule, showsWithoutDates } from '../lib/schedule'
import { toast } from '../lib/toast'
import { useEpisodesMap } from '../lib/useEpisodes'
import { useLibrary } from '../store/library'
import { useSettings } from '../store/settings'
import { USER_STATUS_LABELS, USER_STATUS_ORDER, type UserStatus } from '../types'

export function SchedulePage() {
  const shows = useLibrary((s) => s.shows)
  const setWatched = useLibrary((s) => s.setWatched)
  const scheduleStatuses = useSettings((s) => s.scheduleStatuses)
  const update = useSettings((s) => s.update)

  const today = todayISO()
  const [start, setStart] = useState(() => addDays(todayISO(), -7))
  const [end, setEnd] = useState(() => addDays(todayISO(), 60))
  const [refreshing, setRefreshing] = useState(false)

  const all = useMemo(() => Object.values(shows), [shows])
  const included = useMemo(
    () => all.filter((s) => scheduleStatuses.includes(s.userStatus)),
    [all, scheduleStatuses],
  )

  const { map, loading, errors, reload } = useEpisodesMap(included)

  const groups = useMemo(
    () => buildSchedule(included, map, start, end),
    [included, map, start, end],
  )
  const noDates = useMemo(
    () => showsWithoutDates(included, map, today),
    [included, map, today],
  )

  // Scroll to today (or the first future day) once the list is ready.
  const anchorRef = useRef<HTMLDivElement>(null)
  const didScrollRef = useRef(false)
  const anchorDate = useMemo(
    () => groups.find((g) => g.date >= today)?.date,
    [groups, today],
  )
  useEffect(() => {
    if (didScrollRef.current || loading || !anchorDate) return
    didScrollRef.current = true
    anchorRef.current?.scrollIntoView({ block: 'start' })
  }, [loading, anchorDate])

  function toggleStatus(status: UserStatus) {
    const next = scheduleStatuses.includes(status)
      ? scheduleStatuses.filter((s) => s !== status)
      : [...scheduleStatuses, status]
    update({ scheduleStatuses: next })
  }

  async function refreshAll() {
    if (refreshing || !included.length) return
    setRefreshing(true)
    const results = await Promise.allSettled(
      included.map((show) => pooled(() => refreshShow(show.id))),
    )
    setRefreshing(false)
    const failed = results.filter((r) => r.status === 'rejected').length
    toast(failed ? `Refreshed with ${failed} failure${failed > 1 ? 's' : ''}` : 'Schedule refreshed')
    reload()
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Schedule</h1>
        <button className="btn btn-small" onClick={() => void refreshAll()} disabled={refreshing}>
          <IconRefresh size={14} /> {refreshing ? 'Refreshing…' : 'Refresh all'}
        </button>
      </div>

      <div className="chip-row">
        {USER_STATUS_ORDER.map((status) => (
          <button
            key={status}
            className={`chip chip-btn ${scheduleStatuses.includes(status) ? 'chip-active' : ''}`}
            aria-pressed={scheduleStatuses.includes(status)}
            onClick={() => toggleStatus(status)}
            title={`Toggle ${USER_STATUS_LABELS[status]} shows in the schedule`}
          >
            {USER_STATUS_LABELS[status]}
          </button>
        ))}
      </div>

      {!included.length && (
        <div className="empty-block">
          <p>No shows in the schedule — track some shows or enable more statuses above.</p>
          <Link to="/discover" className="btn">
            Browse Discover
          </Link>
        </div>
      )}

      {loading && <div className="hint">Loading episode lists…</div>}
      {errors > 0 && (
        <div className="notice">
          Couldn't refresh {errors} show{errors > 1 ? 's' : ''} — showing cached data.
        </div>
      )}

      {included.length > 0 && (
        <div className="schedule">
          <button className="btn btn-ghost load-more" onClick={() => setStart(addDays(start, -30))}>
            ← Load earlier (from {fmtDayHeading(start, today)})
          </button>

          {groups.length === 0 && !loading && (
            <div className="hint">Nothing airing between these dates.</div>
          )}

          {groups.map((group) => (
            <div key={group.date} className="sched-day">
              {group.date === anchorDate && <div ref={anchorRef} className="sched-anchor" />}
              <div className={`sched-date ${group.date === today ? 'sched-today' : ''}`}>
                {fmtDayHeading(group.date, today)}
              </div>
              {group.items.map(({ show, ep }) => {
                const badge = premiereLabel(ep) ?? finaleLabel(ep)
                const aired = group.date <= today
                const isWatched = show.watched[ep.id] !== undefined
                return (
                  <div key={`${show.id}-${ep.id}`} className="sched-row">
                    <Link to={`/show/${show.id}`} className="sched-thumb">
                      <PosterImg src={show.poster} alt={show.name} className="poster" />
                    </Link>
                    <div className="sched-info">
                      <Link to={`/show/${show.id}`} className="sched-show">
                        {show.name}
                      </Link>
                      <div className="sched-ep">
                        <span className="chip chip-accent chip-tiny">{epCode(ep)}</span>
                        <span className="sched-ep-name">{ep.name || 'TBA'}</span>
                      </div>
                      <div className="sched-meta">
                        {show.network && <span>{show.network}</span>}
                        {badge && <span className="chip chip-outline chip-tiny">{badge}</span>}
                        {!aired && <span className="sched-rel">{relTime(group.date, today)}</span>}
                      </div>
                    </div>
                    {aired && (
                      <button
                        className={`ep-check ${isWatched ? 'checked' : ''}`}
                        title={isWatched ? 'Mark unwatched' : 'Mark watched'}
                        aria-label={`${isWatched ? 'Unmark' : 'Mark'} ${show.name} ${epCode(ep)} watched`}
                        onClick={() => setWatched(show.id, [ep.id], !isWatched)}
                      >
                        <IconCheck size={16} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          ))}

          <button className="btn btn-ghost load-more" onClick={() => setEnd(addDays(end, 60))}>
            Load later (to {fmtDayHeading(end, today)}) →
          </button>
        </div>
      )}

      {noDates.length > 0 && (
        <section className="section">
          <h2 className="section-title">Waiting for dates</h2>
          <p className="hint">
            Still running or announced, but nothing scheduled from today onward yet.
          </p>
          <div className="chip-row">
            {noDates.map((show) => (
              <Link key={show.id} to={`/show/${show.id}`} className="chip chip-link">
                {show.name}
                {show.airStatus ? ` · ${show.airStatus}` : ''}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
