# PanimuTV 📺

A personal, single-user TV show tracker in the spirit of TV Time — powered by
[TheTVDB](https://thetvdb.com) and **100% browser local storage**. No accounts,
no server, no database: your library never leaves your browser.

Built with Vite + React + TypeScript. Dark, poster-forward UI.

## Features

**Tracking**
- Search TheTVDB and add shows with one tap.
- Five library statuses: Watching · Plan to Watch · On Hold · Completed · Dropped.
- Episode-level watch tracking: per-episode toggle, "mark season watched",
  and "watch up to here" (marks everything before an episode in one go).
- Specials (season 0) are listed but never block progress or "next up".
- Favorites and personal 1–10 ratings.

**Watch Next (home)**
- The next unwatched aired episode for every show you're watching, sorted by
  your recent activity, with a one-tap ✓ that advances to the next episode.
- "Coming up this week" strip across all tracked shows.

**Schedule — scrollable release list**
- Every episode from your tracked shows in one chronological list, grouped by
  day, auto-scrolled to Today.
- Extends backwards ("Load earlier") and forwards ("Load later") as far as you
  like; premiere / season-finale / midseason badges and air-date countdowns.
- Filter by library status (chips at the top), mark aired episodes watched
  right from the list, and a "Waiting for dates" bucket for running/announced
  shows with nothing scheduled yet.

**Discover**
- Live search of TheTVDB.
- Trending now (popular currently-airing), Coming soon (announced premieres,
  dated ones first), New this year, All-time favorites.
- "Because you like <genre>" rows seeded from your own library, weighted by
  how much of each show you've actually watched.

**Stats (Profile)**
- Episodes watched, total watch time, shows tracked, this-month count.
- Top genres, last-12-months activity chart (with table view), most-watched shows.

**Your data**
- One-click JSON backup export / import (library + settings).
- API response cache with size display and one-click clear.
- Full reset. Everything namespaced under `panimu.*` in localStorage.

Also: installable PWA manifest with icons, responsive layout (sidebar on
desktop, bottom tab bar on mobile), offline-tolerant — cached data keeps
working when TheTVDB is unreachable.

## Getting started

```bash
npm install
npm run dev        # → http://localhost:5173
```

Production build:

```bash
npm run build      # type-checks, then bundles to dist/
npm run preview    # serve dist/ locally (includes the API proxy)
npm test           # unit tests (vitest)
```

The `dist/` folder is fully static (hash-based routing, relative asset paths),
so it can be served from any static host or GitHub Pages — a Pages deploy
workflow is included (`.github/workflows/deploy.yml`, runs on pushes to
`main`; enable **Settings → Pages → Source: GitHub Actions** once).

## TheTVDB API

- A default v4 project API key ships in `src/config.ts` and can be changed at
  runtime under **Profile → TheTVDB settings** (subscriber PIN supported).
  This is a personal single-user app, so the key living client-side is a
  deliberate trade-off.
- The client logs in once, keeps the bearer token for ~27 days, and re-logins
  automatically on 401.
- Requests go to `https://api4.thetvdb.com/v4` directly from the browser
  (TheTVDB serves CORS headers). If a direct call can't get through, the
  client transparently falls back to the `/tvdb` path, which `npm run dev`
  and `npm run preview` proxy server-side — whichever transport works is
  remembered.
- Responses are cached in localStorage with sensible TTLs (episodes: 12 h for
  continuing shows, 7 days for ended; discover feeds: 6 h; genres: 30 days),
  with oldest-first eviction if the storage quota is hit.

## Data & backups

Everything is stored in `localStorage` under the `panimu.` prefix:

| Key | Contents |
|---|---|
| `panimu.library.v1` | your shows + watch history |
| `panimu.settings.v1` | API key, language/country, schedule filters |
| `panimu.auth.v1` | TheTVDB bearer token |
| `panimu.cache.*` | cached API responses |

Local storage is per-browser-profile and can be wiped by the browser — use
**Profile → Export backup** regularly. Importing a backup restores everything.

## Project layout

```
src/
  api/        TheTVDB client, response types, TTL cache
  store/      zustand stores persisted to localStorage (library, settings)
  lib/        pure logic (episodes, schedule, stats, dates) + hooks/actions
  components/ shared UI (icons, poster, progress, cards, toasts)
  pages/      Watch Next, My Shows, Show, Schedule, Discover, Profile
```

The pure logic in `src/lib` is unit-tested (`npm test`).

## Credits

Metadata provided by [TheTVDB](https://thetvdb.com). Please consider adding
missing information or subscribing. All icons and artwork in this repo are
original (drawn for this project).
