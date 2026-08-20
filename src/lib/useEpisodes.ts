// React hooks for loading episode lists (single show, or a whole library set).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchEpisodes } from '../api/tvdb'
import { pooled, PRIORITY } from './pool'
import type { Ep, TrackedShow } from '../types'

export function useEpisodes(showId: number | undefined, airStatus?: string) {
  const [eps, setEps] = useState<Ep[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (force: boolean) => {
      if (!showId) return
      setLoading(true)
      setError(null)
      try {
        setEps(await fetchEpisodes(showId, airStatus, force))
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    [showId, airStatus],
  )

  // Clear only when the show itself changes — a late-arriving airStatus hint
  // re-runs `load` but must not blank out an already-rendered episode list.
  useEffect(() => {
    setEps(null)
  }, [showId])

  useEffect(() => {
    void load(false)
  }, [load])

  const refresh = useCallback(() => load(true), [load])

  return { eps, loading, error, refresh }
}

export interface EpisodesMap {
  map: Record<number, Ep[]>
  loading: boolean
  errors: number
  reload: () => void
}

/** Load (mostly from cache) the episode lists for a set of tracked shows. */
export function useEpisodesMap(shows: TrackedShow[]): EpisodesMap {
  const key = useMemo(
    () =>
      shows
        .map((s) => s.id)
        .sort((a, b) => a - b)
        .join(','),
    [shows],
  )
  const [generation, setGeneration] = useState(0)
  const [map, setMap] = useState<Record<number, Ep[]>>({})
  const [pending, setPending] = useState(0)
  const [errors, setErrors] = useState(0)

  useEffect(() => {
    let alive = true
    if (!shows.length) {
      setMap({})
      setPending(0)
      setErrors(0)
      return
    }
    setPending(shows.length)
    setErrors(0)
    for (const show of shows) {
      // Background priority: this is a whole-library sweep, and it must never
      // queue ahead of the schedule's day-targeted fetches.
      pooled(() => fetchEpisodes(show.id, show.airStatus), PRIORITY.background)
        .then((eps) => {
          if (alive) setMap((m) => ({ ...m, [show.id]: eps }))
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
    }
    // `key` covers the identity of `shows`; `generation` forces a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, generation])

  const reload = useCallback(() => setGeneration((g) => g + 1), [])

  return { map, loading: pending > 0, errors, reload }
}
