// Profile: watching stats (computed from local data only), TheTVDB settings,
// and data management (backup, restore, cache, reset).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cacheClear } from '../api/cache'
import { clearAuthToken, peekEpisodes } from '../api/tvdb'
import { IconDownload, IconUpload } from '../components/Icons'
import { APP_VERSION } from '../config'
import { exportBackup, importBackup } from '../lib/backup'
import { fmtMinutes } from '../lib/dates'
import { computeStats } from '../lib/stats'
import { fmtBytes, measureOrigin, measureStorage, type StorageReport } from '../lib/storage'
import { TvTimeImport } from '../components/TvTimeImport'
import { toast } from '../lib/toast'
import { useLibrary } from '../store/library'
import { useSettings } from '../store/settings'
import { USER_STATUS_LABELS, USER_STATUS_ORDER, type Ep } from '../types'
import { Link } from 'react-router-dom'

const LANGUAGES = [
  ['eng', 'English'],
  ['spa', 'Spanish'],
  ['fra', 'French'],
  ['deu', 'German'],
  ['ita', 'Italian'],
  ['por', 'Portuguese'],
  ['nld', 'Dutch'],
  ['swe', 'Swedish'],
  ['dan', 'Danish'],
  ['nor', 'Norwegian'],
  ['fin', 'Finnish'],
  ['pol', 'Polish'],
  ['tur', 'Turkish'],
  ['rus', 'Russian'],
  ['jpn', 'Japanese'],
  ['kor', 'Korean'],
  ['zho', 'Chinese'],
] as const

const COUNTRIES = [
  ['usa', 'United States'],
  ['gbr', 'United Kingdom'],
  ['can', 'Canada'],
  ['aus', 'Australia'],
  ['nzl', 'New Zealand'],
  ['irl', 'Ireland'],
  ['deu', 'Germany'],
  ['fra', 'France'],
  ['esp', 'Spain'],
  ['ita', 'Italy'],
  ['nld', 'Netherlands'],
  ['swe', 'Sweden'],
  ['nor', 'Norway'],
  ['dnk', 'Denmark'],
  ['fin', 'Finland'],
  ['bra', 'Brazil'],
  ['mex', 'Mexico'],
  ['jpn', 'Japan'],
  ['kor', 'South Korea'],
  ['ind', 'India'],
] as const

export function ProfilePage() {
  const shows = useLibrary((s) => s.shows)
  const settings = useSettings()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [storage, setStorage] = useState<StorageReport>(() => measureStorage())
  // Value of the credential field when it gained focus, so blur only resets
  // the API session when something actually changed.
  const focusValueRef = useRef('')

  const refreshStorage = useCallback(() => {
    setStorage(measureStorage())
    void measureOrigin().then((origin) => setStorage((prev) => ({ ...prev, ...origin })))
  }, [])

  // Keep the readout truthful while the page is open: the cache also grows
  // from background fetches, which no store subscription would catch.
  useEffect(() => {
    refreshStorage()
    const timer = setInterval(refreshStorage, 3000)
    return () => clearInterval(timer)
  }, [refreshStorage])

  const all = useMemo(() => Object.values(shows), [shows])
  const epsMap = useMemo(() => {
    const map: Record<number, Ep[] | null> = {}
    for (const show of all) map[show.id] = peekEpisodes(show.id)
    return map
  }, [all])
  const stats = useMemo(() => computeStats(all, epsMap), [all, epsMap])

  const maxGenre = Math.max(1, ...stats.topGenres.map((g) => g.count))
  const maxMonth = Math.max(1, ...stats.months.map((m) => m.count))

  const pctRaw = (storage.totalBytes / storage.limitBytes) * 100
  const pctUsed = Math.min(100, Math.round(pctRaw))
  const pctLabel = storage.totalBytes > 0 && pctUsed === 0 ? '<1' : String(pctUsed)
  const nearLimit = pctUsed >= 80

  async function onImportFile(file: File) {
    if (
      !window.confirm(
        'Importing a backup REPLACES your current library and settings. Continue?',
      )
    ) {
      return
    }
    try {
      const count = await importBackup(file)
      toast(`Imported ${count} show${count === 1 ? '' : 's'} from backup`)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Import failed')
    }
  }

  function resetEverything() {
    if (!window.confirm('Delete ALL PanimuTV data in this browser (library, settings, cache)?')) return
    if (!window.confirm('Last chance — this cannot be undone. Really delete everything?')) return
    const doomed: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith('panimu.')) doomed.push(key)
    }
    for (const key of doomed) localStorage.removeItem(key)
    window.location.reload()
  }

  return (
    <div className="page">
      <h1 className="page-title">Profile</h1>

      {/* ------------------------------------------------ Stats */}
      <section className="section">
        <h2 className="section-title">Your stats</h2>
        <div className="stat-tiles">
          <div className="stat-tile">
            <div className="stat-value">{stats.episodesWatched.toLocaleString()}</div>
            <div className="stat-label">episodes watched</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">{fmtMinutes(stats.minutesWatched)}</div>
            <div className="stat-label">time watched</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">{stats.totalShows}</div>
            <div className="stat-label">shows tracked</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">{stats.thisMonth}</div>
            <div className="stat-label">episodes this month</div>
          </div>
        </div>

        <div className="chip-row status-breakdown">
          {USER_STATUS_ORDER.map((status) =>
            stats.byStatus[status] > 0 ? (
              <span key={status} className="chip">
                {USER_STATUS_LABELS[status]}: {stats.byStatus[status]}
              </span>
            ) : null,
          )}
          {stats.favorites > 0 && <span className="chip">★ Favorites: {stats.favorites}</span>}
        </div>

        {stats.topGenres.length > 0 && (
          <div className="chart-block">
            <h3 className="chart-title">Top genres (weighted by episodes watched)</h3>
            <div className="genre-bars">
              {stats.topGenres.map((genre) => (
                <div key={genre.name} className="genre-bar-row">
                  <span className="genre-bar-label">{genre.name}</span>
                  <div className="genre-bar-track">
                    <div
                      className="genre-bar-fill"
                      style={{ width: `${(genre.count / maxGenre) * 100}%` }}
                    />
                  </div>
                  <span className="genre-bar-value">{Math.round(genre.count)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {stats.episodesWatched > 0 && (
          <div className="chart-block">
            <h3 className="chart-title">Episodes watched · last 12 months</h3>
            <div className="month-chart" role="img" aria-label="Episodes watched per month, last 12 months">
              {stats.months.map((month) => (
                <div key={month.key} className="month-col" title={`${month.label}: ${month.count} episodes`}>
                  <span className="month-count">{month.count > 0 ? month.count : ''}</span>
                  <div
                    className="month-bar"
                    style={{ height: `${Math.max(month.count > 0 ? 6 : 2, (month.count / maxMonth) * 100)}%` }}
                  />
                  <span className="month-label">{month.label}</span>
                </div>
              ))}
            </div>
            <details className="table-view">
              <summary>View as table</summary>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Month</th>
                    <th scope="col">Episodes</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.months.map((month) => (
                    <tr key={month.key}>
                      <td>{month.key}</td>
                      <td>{month.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>
        )}

        {stats.topShows.length > 0 && (
          <div className="chart-block">
            <h3 className="chart-title">Most watched shows</h3>
            <ol className="top-shows">
              {stats.topShows.map(({ show, count }) => (
                <li key={show.id}>
                  <Link to={`/show/${show.id}`}>{show.name}</Link>
                  <span className="top-shows-count">{count} eps</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>

      {/* ------------------------------------------------ Settings */}
      <section className="section">
        <h2 className="section-title">TheTVDB settings</h2>
        <div className="form-grid">
          <label className="field">
            <span>API key</span>
            <input
              type="text"
              value={settings.apiKey}
              spellCheck={false}
              onChange={(e) => settings.update({ apiKey: e.target.value })}
              onFocus={(e) => {
                focusValueRef.current = e.target.value
              }}
              onBlur={(e) => {
                if (e.target.value !== focusValueRef.current) {
                  clearAuthToken()
                  toast('API key updated — a new session starts on the next request')
                }
              }}
            />
          </label>
          <label className="field">
            <span>Subscriber PIN (only for user-supported keys)</span>
            <input
              type="text"
              value={settings.pin}
              spellCheck={false}
              placeholder="Usually empty"
              onChange={(e) => settings.update({ pin: e.target.value })}
              onFocus={(e) => {
                focusValueRef.current = e.target.value
              }}
              onBlur={(e) => {
                if (e.target.value !== focusValueRef.current) clearAuthToken()
              }}
            />
          </label>
          <label className="field">
            <span>Language</span>
            <select
              value={settings.language}
              onChange={(e) => settings.update({ language: e.target.value })}
            >
              {LANGUAGES.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Country (for Discover feeds)</span>
            <select
              value={settings.country}
              onChange={(e) => settings.update({ country: e.target.value })}
            >
              {COUNTRIES.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* ------------------------------------------------ Data */}
      <section className="section">
        <h2 className="section-title">Your data</h2>
        <p className="hint">
          Everything lives in this browser's local storage. Export a backup now and then —
          it's the only copy of your watch history.
        </p>

        <div className="storage-block">
          <div className="storage-head">
            <span className="storage-total">{fmtBytes(storage.totalBytes)}</span>
            <span className="storage-of">
              of about {fmtBytes(storage.limitBytes)} local storage used ({pctLabel}%)
            </span>
          </div>
          <div
            className="storage-bar"
            role="img"
            aria-label={`Storage in use: ${storage.buckets
              .map((b) => `${b.label} ${fmtBytes(b.bytes)}`)
              .join(', ')}`}
          >
            {storage.buckets.map((bucket) => (
              <div
                key={bucket.id}
                className={`storage-seg storage-seg-${bucket.id}`}
                style={{
                  width: `${Math.max(2, (bucket.bytes / Math.max(1, storage.totalBytes)) * 100)}%`,
                }}
                title={`${bucket.label}: ${fmtBytes(bucket.bytes)}`}
              />
            ))}
          </div>
          {storage.buckets.length > 0 ? (
            <ul className="storage-legend">
              {storage.buckets.map((bucket) => (
                <li key={bucket.id}>
                  <span className={`storage-dot storage-seg-${bucket.id}`} />
                  <span className="storage-legend-label">{bucket.label}</span>
                  <span className="storage-legend-size">{fmtBytes(bucket.bytes)}</span>
                  <span className="storage-legend-hint">{bucket.hint}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint storage-empty">
              Nothing stored yet — add a show and your library will appear here.
            </p>
          )}
          {storage.originUsageBytes !== undefined && (
            <p className="hint storage-origin">
              Offline app cache: {fmtBytes(storage.originUsageBytes)}
              {storage.originQuotaBytes
                ? ` of ${fmtBytes(storage.originQuotaBytes)} the browser allows this site`
                : ''}
              . Counted separately from local storage above.
            </p>
          )}
          {nearLimit && (
            <div className="notice">
              Local storage is filling up. Clearing the API cache below frees space instantly —
              it re-downloads on demand.
            </div>
          )}
        </div>

        <div className="btn-row">
          <button
            className="btn btn-accent"
            onClick={() => {
              exportBackup()
              toast('Backup downloaded')
            }}
          >
            <IconDownload size={16} /> Export backup
          </button>
          <button className="btn" onClick={() => fileInputRef.current?.click()}>
            <IconUpload size={16} /> Import backup
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void onImportFile(file)
              e.target.value = ''
            }}
          />
          <button
            className="btn"
            onClick={() => {
              const removed = cacheClear()
              refreshStorage()
              toast(`Cleared ${removed} cached entr${removed === 1 ? 'y' : 'ies'}`)
            }}
          >
            Clear API cache
          </button>
          <button className="btn btn-danger" onClick={resetEverything}>
            Reset everything
          </button>
        </div>

        <TvTimeImport />
      </section>

      {/* ------------------------------------------------ About */}
      <section className="section about">
        <h2 className="section-title">About</h2>
        <p>
          PanimuTV v{APP_VERSION} — a personal, single-user show tracker. No accounts, no
          server: your library never leaves this browser.
        </p>
        <p>
          Metadata provided by{' '}
          <a href="https://thetvdb.com" target="_blank" rel="noreferrer">
            TheTVDB
          </a>
          . Please consider adding missing information or subscribing.
        </p>
      </section>
    </div>
  )
}
