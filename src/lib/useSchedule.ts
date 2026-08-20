// Loads a day-grouped release list for a date window.
//
// Order of operations, chosen so the days around Today appear as early as
// possible:
//   1. Shows that provably cannot touch the window are dropped outright.
//   2. Cached episode lists are read SYNCHRONOUSLY, so a revisit paints the
//      schedule on the very first render with no await.
//   3. Whatever is still missing is fetched nearest-airing-first.
//   4. Arrivals merge into a day index incrementally and flush on a timer,
//      so a large library cannot cause a rebuild storm.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchEpisodes, peekEpisodes } from '../api/tvdb'
import { pooled, PRIORITY } from './pool'
import { indexShow, toDays, type DayIndex, type ScheduleDay } from './schedule'
import { planWindow, windowPriority } from './scheduleWindow'
import type { Ep, TrackedShow } from '../types'

/** How long arrivals are batched before the day list re-renders. */
const FLUSH_MS = 80

export interface ScheduleData {
  days: ScheduleDay[]
  /** Episode lists loaded so far, for callers needing raw episodes. */
  epsByShow: Record<number, Ep[]>
  /** Shows still being fetched. */
  pending: number
  /** Shows the window needs at all (after skipping out-of-range ones). */
  relevant: number
  /** Shows skipped because their run cannot intersect the window. */
  skipped: number
  /** True until the first paint has whatever the cache could offer. */
  loading: boolean
  errors: number
  reload: () => void
}

export function useSchedule(
  shows: TrackedShow[],
  start: string,
  end: string,
  today: string,
): ScheduleData {
  const showsKey = useMemo(
    () =>
      shows
        .map((s) => s.id)
        .sort((a, b) => a - b)
        .join(','),
    [shows],
  )
  const [generation, setGeneration] = useState(0)

  const indexRef = useRef<DayIndex>(new Map())
  const epsRef = useRef<Record<number, Ep[]>>({})
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [days, setDays] = useState<ScheduleDay[]>([])
  const [epsByShow, setEpsByShow] = useState<Record<number, Ep[]>>({})
  const [pending, setPending] = useState(0)
  const [errors, setErrors] = useState(0)
  const [counts, setCounts] = useState({ relevant: 0, skipped: 0 })
  const [loading, setLoading] = useState(true)

  // Sorting days by show name needs current names, but must not re-run the
  // loader when an unrelated show field changes.
  const nameById = useMemo(() => {
    const map = new Map<number, string>()
    for (const show of shows) map.set(show.id, show.name)
    return map
  }, [shows])
  const nameRef = useRef(nameById)
  nameRef.current = nameById

  useEffect(() => {
    let alive = true
    const index: DayIndex = new Map()
    indexRef.current = index
    epsRef.current = {}
    setErrors(0)

    const flush = () => {
      if (!alive) return
      flushTimer.current = null
      setDays(toDays(indexRef.current, nameRef.current))
      setEpsByShow({ ...epsRef.current })
    }
    const scheduleFlush = () => {
      if (!alive || flushTimer.current) return
      flushTimer.current = setTimeout(flush, FLUSH_MS)
    }

    const { relevant, skipped } = planWindow(shows, start, end, today)
    setCounts({ relevant: relevant.length, skipped: skipped.length })

    // 1. Synchronous pass: everything already in localStorage renders now.
    const needsFetch: TrackedShow[] = []
    for (const show of relevant) {
      const cached = peekEpisodes(show.id)
      if (cached) {
        epsRef.current[show.id] = cached
        indexShow(index, show.id, cached, start, end)
      } else {
        needsFetch.push(show)
      }
    }
    setDays(toDays(index, nameById))
    setEpsByShow({ ...epsRef.current })
    setLoading(false)

    if (!needsFetch.length) {
      setPending(0)
      return () => {
        alive = false
      }
    }

    // 2. Fetch the rest nearest-airing-first (planWindow already ordered them).
    setPending(needsFetch.length)
    for (const show of needsFetch) {
      const priority =
        PRIORITY.schedule + Math.min(999, windowPriority(show, start, end, today))
      pooled(() => fetchEpisodes(show.id, show.airStatus), priority)
        .then((eps) => {
          if (!alive) return
          epsRef.current[show.id] = eps
          indexShow(indexRef.current, show.id, eps, start, end)
          scheduleFlush()
        })
        .catch(() => {
          if (alive) setErrors((n) => n + 1)
        })
        .finally(() => {
          if (alive) setPending((p) => p - 1)
        })
    }

    return () => {
      alive = false
      if (flushTimer.current) {
        clearTimeout(flushTimer.current)
        flushTimer.current = null
      }
    }
    // `showsKey` stands in for the identity of `shows`; `generation` forces a
    // reload. Name changes re-sort via nameRef without restarting the loader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showsKey, start, end, today, generation])

  // Re-sort (cheaply) when show names change without refetching anything.
  useEffect(() => {
    setDays((prev) => (prev.length ? toDays(indexRef.current, nameById) : prev))
  }, [nameById])

  const reload = useCallback(() => setGeneration((g) => g + 1), [])

  return {
    days,
    epsByShow,
    pending,
    relevant: counts.relevant,
    skipped: counts.skipped,
    loading,
    errors,
    reload,
  }
}
