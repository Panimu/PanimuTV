// Discover: search TheTVDB, plus curated rows — trending, coming soon,
// new this year, all-time favorites, and genre picks seeded from your library.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { searchSeries } from '../api/tvdb'
import type { SearchResult, SeriesBase } from '../api/types'
import { IconSearch, IconX } from '../components/Icons'
import { ShowCard } from '../components/ShowCard'
import { seedFromBase, seedFromSearch } from '../lib/actions'
import { fmtDate } from '../lib/dates'
import { byGenreName, comingSoon, newThisYear, topGenresOf, topRated, trendingNow } from '../lib/discover'
import { rankSearchResults } from '../lib/titleMatch'
import { useLibrary } from '../store/library'

export function DiscoverPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const searchSeq = useRef(0)

  const runSearch = useCallback((q: string) => {
    const seq = ++searchSeq.current
    setSearching(true)
    setSearchError(null)
    searchSeries(q)
      .then((r) => {
        if (searchSeq.current === seq) setResults(r)
      })
      .catch((err) => {
        if (searchSeq.current === seq) {
          setSearchError(err instanceof Error ? err.message : String(err))
        }
      })
      .finally(() => {
        if (searchSeq.current === seq) setSearching(false)
      })
  }, [])

  // Auto-search after a pause for 2+ characters. Shorter titles ("V", "W")
  // can still be searched explicitly with Enter (see the form's onSubmit).
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      searchSeq.current++ // invalidate any in-flight search
      setResults(null)
      setSearching(false)
      setSearchError(null)
      return
    }
    const timer = setTimeout(() => runSearch(q), 400)
    return () => clearTimeout(timer)
  }, [query, runSearch])

  const libraryShows = useLibrary((s) => s.shows)
  const favoriteGenres = useMemo(
    () => topGenresOf(Object.values(libraryShows), 2),
    [libraryShows],
  )

  // Surface the closest titles first for partial queries; TVDB's own
  // relevance order breaks ties (and stands alone for very short queries).
  const rankedResults = useMemo(() => {
    const list = (results ?? []).filter((r) => r.type === 'series' && Number(r.tvdb_id) > 0)
    const q = query.trim()
    return q.length >= 3 ? rankSearchResults(list, q) : list
  }, [results, query])

  const year = new Date().getFullYear()
  const isSearchMode = searching || results !== null || !!searchError

  return (
    <div className="page">
      <h1 className="page-title">Discover</h1>

      <form
        className="search-box"
        onSubmit={(e) => {
          e.preventDefault()
          const q = query.trim()
          if (q) runSearch(q)
        }}
      >
        <IconSearch size={18} className="search-icon" />
        <input
          type="search"
          value={query}
          placeholder="Search TheTVDB for a show…"
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search shows"
        />
        {query && (
          <button
            type="button"
            className="search-clear"
            onClick={() => setQuery('')}
            aria-label="Clear search"
          >
            <IconX size={16} />
          </button>
        )}
      </form>

      {isSearchMode ? (
        <section className="section">
          {searching && <div className="hint">Searching…</div>}
          {searchError && <div className="notice">{searchError}</div>}
          {results && !results.length && !searching && (
            <div className="hint">No shows found for “{query.trim()}”.</div>
          )}
          <div className="card-grid">
            {rankedResults.map((r) => (
              <ShowCard key={r.objectID} seed={seedFromSearch(r)} meta={r.network ?? r.status} />
            ))}
          </div>
        </section>
      ) : (
        <>
          <DiscoverRow
            title="Trending now"
            subtitle="Popular shows currently on the air"
            load={trendingNow}
          />
          <DiscoverRow
            title="Coming soon"
            subtitle="Announced shows and upcoming premieres"
            load={comingSoon}
            showPremiereDate
          />
          {favoriteGenres.map((genre) => (
            <DiscoverRow
              key={genre}
              title={`Because you like ${genre}`}
              subtitle="Top-scored shows in a genre you watch"
              load={() => byGenreName(genre)}
            />
          ))}
          <DiscoverRow title={`New in ${year}`} subtitle="This year's premieres" load={newThisYear} />
          <DiscoverRow
            title="All-time favorites"
            subtitle="The highest-scored shows on TheTVDB"
            load={topRated}
          />
        </>
      )}
    </div>
  )
}

interface DiscoverRowProps {
  title: string
  subtitle?: string
  load: () => Promise<SeriesBase[]>
  showPremiereDate?: boolean
}

function DiscoverRow({ title, subtitle, load, showPremiereDate }: DiscoverRowProps) {
  const [shows, setShows] = useState<SeriesBase[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    load()
      .then((r) => {
        if (alive) setShows(r)
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      alive = false
    }
    // Each row loads once for its fixed feed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Snapshot the library when the feed arrives so newly-added shows don't
  // vanish from the row mid-browse (their card flips to a checkmark instead).
  const visible = useMemo(() => {
    const tracked = useLibrary.getState().shows
    return (shows ?? []).filter((s) => !tracked[s.id]).slice(0, 24)
  }, [shows])

  if (error) {
    return (
      <section className="section disc-row">
        <h2 className="section-title">{title}</h2>
        <div className="notice">{error}</div>
      </section>
    )
  }
  if (shows && !visible.length) return null

  return (
    <section className="section disc-row">
      <h2 className="section-title">{title}</h2>
      {subtitle && <p className="section-sub">{subtitle}</p>}
      {!shows ? (
        <div className="hscroll">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="show-card skeleton" />
          ))}
        </div>
      ) : (
        <div className="hscroll">
          {visible.map((s) => (
            <ShowCard
              key={s.id}
              seed={seedFromBase(s)}
              meta={
                showPremiereDate && s.firstAired ? `Premieres ${fmtDate(s.firstAired)}` : undefined
              }
            />
          ))}
        </div>
      )}
    </section>
  )
}
