// My Shows: the whole library as a poster grid with status tabs and sorting.

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconStar } from '../components/Icons'
import { PosterImg } from '../components/PosterImg'
import { ProgressBar } from '../components/ProgressBar'
import { relTime, todayISO } from '../lib/dates'
import { lastActivityTs, progressOf } from '../lib/episodes'
import { useEpisodesMap } from '../lib/useEpisodes'
import { useLibrary } from '../store/library'
import {
  USER_STATUS_LABELS,
  USER_STATUS_ORDER,
  type TrackedShow,
  type UserStatus,
} from '../types'

type Tab = 'all' | 'favorites' | UserStatus
type SortMode = 'activity' | 'name' | 'progress' | 'nextAired'

const SORT_LABELS: Record<SortMode, string> = {
  activity: 'Recent activity',
  name: 'Name',
  progress: 'Progress',
  nextAired: 'Next airing',
}

export function MyShowsPage() {
  const shows = useLibrary((s) => s.shows)
  const [tab, setTab] = useState<Tab>('all')
  const [sort, setSort] = useState<SortMode>('activity')

  const all = useMemo(() => Object.values(shows), [shows])
  const filtered = useMemo(() => {
    if (tab === 'all') return all
    if (tab === 'favorites') return all.filter((s) => s.favorite)
    return all.filter((s) => s.userStatus === tab)
  }, [all, tab])

  const { map } = useEpisodesMap(filtered)
  const today = todayISO()

  const sorted = useMemo(() => {
    const progressPct = (show: TrackedShow) =>
      map[show.id] ? progressOf(show.watched, map[show.id], today).pct : 0
    const list = [...filtered]
    switch (sort) {
      case 'name':
        list.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'progress':
        list.sort((a, b) => progressPct(b) - progressPct(a))
        break
      case 'nextAired': {
        // A nextAired in the past is stale data, not an upcoming episode.
        const upcoming = (s: TrackedShow) =>
          s.nextAired && s.nextAired >= today ? s.nextAired : null
        list.sort((a, b) => {
          const an = upcoming(a)
          const bn = upcoming(b)
          if (an && bn) return an.localeCompare(bn)
          if (an) return -1
          if (bn) return 1
          return a.name.localeCompare(b.name)
        })
        break
      }
      default:
        list.sort((a, b) => lastActivityTs(b) - lastActivityTs(a))
    }
    return list
  }, [filtered, sort, map, today])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: all.length, favorites: 0 }
    for (const status of USER_STATUS_ORDER) c[status] = 0
    for (const show of all) {
      c[show.userStatus]++
      if (show.favorite) c.favorites++
    }
    return c
  }, [all])

  const tabs: { key: Tab; label: string }[] = [
    { key: 'all', label: 'All' },
    ...USER_STATUS_ORDER.map((status) => ({ key: status as Tab, label: USER_STATUS_LABELS[status] })),
    { key: 'favorites', label: '★ Favorites' },
  ]

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">My Shows</h1>
        <label className="sort-control">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
            {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {SORT_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="chip-row">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            className={`chip chip-btn ${tab === key ? 'chip-active' : ''}`}
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
            {counts[key] > 0 && <span className="chip-count">{counts[key]}</span>}
          </button>
        ))}
      </div>

      {sorted.length === 0 && (
        <div className="empty-block">
          <p>Nothing here yet.</p>
          <Link to="/discover" className="btn">
            Find shows to track
          </Link>
        </div>
      )}

      <div className="poster-grid">
        {sorted.map((show) => {
          const eps = map[show.id]
          const progress = eps ? progressOf(show.watched, eps, today) : null
          return (
            <Link key={show.id} to={`/show/${show.id}`} className="grid-card">
              <div className="grid-card-imgwrap">
                <PosterImg src={show.poster} alt={show.name} className="poster" />
                {show.favorite && (
                  <span className="fav-badge" title="Favorite">
                    <IconStar size={13} filled />
                  </span>
                )}
                {progress && progress.aired > 0 && (
                  <ProgressBar value={progress.pct} className="grid-progress" />
                )}
              </div>
              <div className="grid-card-name">{show.name}</div>
              <div className="grid-card-meta">
                {progress && progress.aired > 0
                  ? `${progress.watched}/${progress.aired} watched`
                  : USER_STATUS_LABELS[show.userStatus]}
                {show.nextAired && show.nextAired >= today && (
                  <span className="grid-card-next"> · next {relTime(show.nextAired, today)}</span>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
