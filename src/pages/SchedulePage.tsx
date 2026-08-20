// Schedule: one scrollable release list of every episode from your tracked
// shows, grouped by day and anchored at Today.
//
// Loading is day-first: shows that cannot touch the visible window are never
// fetched, cached data paints immediately, and the rest arrives
// nearest-airing-first. Days render progressively outward from Today so a
// large library never blocks the part you are looking at.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconCheck, IconRefresh } from '../components/Icons'
import { PosterImg } from '../components/PosterImg'
import { refreshShow } from '../lib/actions'
import { addDays, fmtDayHeading, relTime, todayISO } from '../lib/dates'
import { epCode, finaleLabel, premiereLabel } from '../lib/episodes'
import { pooled, PRIORITY } from '../lib/pool'
import { showsWithoutDates } from '../lib/schedule'
import { toast } from '../lib/toast'
import { useSchedule } from '../lib/useSchedule'
import { useLibrary } from '../store/library'
import { useSettings } from '../store/settings'
import { USER_STATUS_LABELS, USER_STATUS_ORDER, type UserStatus } from '../types'

/** Days rendered ahead of / behind Today before the reader asks for more. */
const INITIAL_AFTER = 12
const INITIAL_BEFORE = 3
const STEP_AFTER = 14
const STEP_BEFORE = 10

/** Widening the date window weakens the skip test, so cap how far it can go. */
const MAX_PAST_DAYS = 730
const MAX_FUTURE_DAYS = 730

export function SchedulePage() {
  const shows = useLibrary((s) => s.shows)
  const setWatched = useLibrary((s) => s.setWatched)
  const scheduleStatuses = useSettings((s) => s.scheduleStatuses)
  const update = useSettings((s) => s.update)

  const today = todayISO()
  const [start, setStart] = useState(() => addDays(todayISO(), -7))
  const [end, setEnd] = useState(() => addDays(todayISO(), 60))
  const [refreshing, setRefreshing] = useState(false)

  const included = useMemo(
    () => Object.values(shows).filter((s) => scheduleStatuses.includes(s.userStatus)),
    [shows, scheduleStatuses],
  )

  const { days, epsByShow, pending, relevant, skipped, loading, errors, reload } = useSchedule(
    included,
    start,
    end,
    today,
  )

  // --- progressive day rendering -----------------------------------------
  const anchorIndex = useMemo(() => {
    const idx = days.findIndex((day) => day.date >= today)
    return idx === -1 ? Math.max(0, days.length - 1) : idx
  }, [days, today])

  const [shownAfter, setShownAfter] = useState(INITIAL_AFTER)
  const [shownBefore, setShownBefore] = useState(INITIAL_BEFORE)

  const from = Math.max(0, anchorIndex - shownBefore)
  const to = Math.min(days.length, anchorIndex + shownAfter)
  const visibleDays = useMemo(() => days.slice(from, to), [days, from, to])
  const hasMoreLoadedAfter = to < days.length
  const hasMoreLoadedBefore = from > 0

  const maxEnd = useMemo(() => addDays(today, MAX_FUTURE_DAYS), [today])
  const minStart = useMemo(() => addDays(today, -MAX_PAST_DAYS), [today])
  const canWidenEnd = end < maxEnd
  const canWidenStart = start > minStart

  // Reveal already-loaded days first; only widen the fetch window once the
  // reader has actually reached the end of what is loaded.
  const extendForward = useCallback(() => {
    if (hasMoreLoadedAfter) {
      setShownAfter((n) => n + STEP_AFTER)
    } else if (canWidenEnd) {
      setEnd((prev) => (prev < maxEnd ? addDays(prev, 60) : prev))
      setShownAfter((n) => n + STEP_AFTER)
    }
  }, [hasMoreLoadedAfter, canWidenEnd, maxEnd])

  const loadEarlier = useCallback(() => {
    if (hasMoreLoadedBefore) {
      setShownBefore((n) => n + STEP_BEFORE)
    } else if (canWidenStart) {
      setStart((prev) => (prev > minStart ? addDays(prev, -30) : prev))
      setShownBefore((n) => n + STEP_BEFORE)
    }
  }, [hasMoreLoadedBefore, canWidenStart, minStart])

  // Reveal more days as the reader approaches the end of the rendered list.
  // Only ever grows the RENDER window: with an empty list the sentinel is
  // trivially on screen, and letting it widen the fetch window there caused
  // spurious full reloads on mount.
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = bottomRef.current
    if (!node || !hasMoreLoadedAfter) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setShownAfter((n) => n + STEP_AFTER)
      },
      { rootMargin: '400px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMoreLoadedAfter, visibleDays.length])

  // --- today anchor ------------------------------------------------------
  const anchorRef = useRef<HTMLDivElement>(null)
  const userScrolledRef = useRef(false)
  const anchorDate = days[anchorIndex]?.date

  useEffect(() => {
    const onScroll = () => {
      userScrolledRef.current = true
    }
    window.addEventListener('wheel', onScroll, { passive: true })
    window.addEventListener('touchmove', onScroll, { passive: true })
    window.addEventListener('keydown', onScroll)
    return () => {
      window.removeEventListener('wheel', onScroll)
      window.removeEventListener('touchmove', onScroll)
      window.removeEventListener('keydown', onScroll)
    }
  }, [])

  useEffect(() => {
    if (userScrolledRef.current || !anchorDate) return
    anchorRef.current?.scrollIntoView({ block: 'start' })
  }, [anchorDate])

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
      included.map((show) => pooled(() => refreshShow(show.id), PRIORITY.interactive)),
    )
    setRefreshing(false)
    const failed = results.filter((r) => r.status === 'rejected').length
    toast(failed ? `Refreshed with ${failed} failure${failed > 1 ? 's' : ''}` : 'Schedule refreshed')
    reload()
  }

  const noDates = useMemo(
    () => showsWithoutDates(included, epsByShow, today),
    [included, epsByShow, today],
  )

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

      {pending > 0 && (
        <div className="hint sched-loading">
          Loading {pending} more show{pending === 1 ? '' : 's'}…
          {skipped > 0 && ` (skipped ${skipped} outside these dates)`}
        </div>
      )}
      {errors > 0 && (
        <div className="notice">
          Couldn't refresh {errors} show{errors > 1 ? 's' : ''} — showing cached data.
        </div>
      )}

      {included.length > 0 && (
        <div className="schedule">
          {(hasMoreLoadedBefore || canWidenStart) && (
            <button className="btn btn-ghost load-more" onClick={loadEarlier}>
              ← Earlier episodes
            </button>
          )}

          {days.length === 0 && pending === 0 && !loading && (
            <div className="hint">
              Nothing airing between these dates
              {relevant === 0 && skipped > 0 ? ' — every tracked show finished earlier' : ''}.
            </div>
          )}

          {visibleDays.map((day) => (
            <div key={day.date} className="sched-day">
              {day.date === anchorDate && <div ref={anchorRef} className="sched-anchor" />}
              <div className={`sched-date ${day.date === today ? 'sched-today' : ''}`}>
                {fmtDayHeading(day.date, today)}
              </div>
              {day.entries.map(({ showId, ep }) => {
                const show = shows[showId]
                if (!show) return null
                const badge = premiereLabel(ep) ?? finaleLabel(ep)
                const aired = day.date <= today
                const isWatched = show.watched[ep.id] !== undefined
                return (
                  <div key={`${showId}-${ep.id}`} className="sched-row">
                    <Link to={`/show/${showId}`} className="sched-thumb">
                      <PosterImg src={show.poster} alt={show.name} className="poster" />
                    </Link>
                    <div className="sched-info">
                      <Link to={`/show/${showId}`} className="sched-show">
                        {show.name}
                      </Link>
                      <div className="sched-ep">
                        <span className="chip chip-accent chip-tiny">{epCode(ep)}</span>
                        <span className="sched-ep-name">{ep.name || 'TBA'}</span>
                      </div>
                      <div className="sched-meta">
                        {show.network && <span>{show.network}</span>}
                        {badge && <span className="chip chip-outline chip-tiny">{badge}</span>}
                        {!aired && <span className="sched-rel">{relTime(day.date, today)}</span>}
                      </div>
                    </div>
                    {aired && (
                      <button
                        className={`ep-check ${isWatched ? 'checked' : ''}`}
                        title={isWatched ? 'Mark unwatched' : 'Mark watched'}
                        aria-label={`${isWatched ? 'Unmark' : 'Mark'} ${show.name} ${epCode(ep)} watched`}
                        onClick={() => setWatched(showId, [ep.id], !isWatched)}
                      >
                        <IconCheck size={16} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          ))}

          {days.length > 0 && <div ref={bottomRef} />}
          {(hasMoreLoadedAfter || canWidenEnd) && (
            <button className="btn btn-ghost load-more" onClick={extendForward}>
              Later episodes →
            </button>
          )}
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
