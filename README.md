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
- Live storage breakdown: how much local storage the library, the API cache,
  settings and the auth token each use, as a share of the browser's ~5 MB
  limit, with a warning before you run out.
- One-click JSON backup export / import (library + settings).
- API response cache with one-click clear.
- Full reset. Everything namespaced under `panimu.*` in localStorage.

**Import from TV Time**
- Drop in the ZIP from TV Time's personal-data export (Settings → Account →
  Download my data) and it reads the CSVs in-browser — no upload, no server.
- Tolerant parsing: files are classified by sniffing their headers against
  synonym lists rather than assuming one schema, so exports of different
  vintages all work. Movie files are skipped and reported.
- Shows resolve by TheTVDB id first (verified by fetching the series), then
  fall back to a title search; episodes match on season/episode number.
- Preview before committing, live progress, then a report listing what was
  matched by title and what wasn't found.
- Purely additive — an import never unmarks anything, keeps the earliest
  watch date on conflicts, and re-running it is safe.

Also: installable PWA (service worker precaches the app shell, artwork is
cached offline, updates apply automatically), responsive layout (sidebar on
desktop, bottom tab bar on mobile, iPhone safe-area aware), offline-tolerant —
cached data keeps working when TheTVDB is unreachable.

## Hosted app

The app deploys to GitHub Pages on every push to the default branch:

**https://panimu.github.io/PanimuTV/**

`.github/workflows/deploy.yml` builds `dist/` and force-publishes it to the
`gh-pages` branch, which GitHub Pages serves. Because all state is in
localStorage, the hosted app is still 100% private to your browser.

### Install on iPhone/iPad (PWA)

1. Open the URL above in **Safari**.
2. Share → **Add to Home Screen**.
3. It launches full-screen with its own icon, works offline for everything
   already cached, and keeps your library in the app's local storage.

> localStorage for a home-screen web app is persistent, but iOS can evict it
> if the app is unused for weeks and the device is low on space — use
> **Profile → Export backup** regularly.

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
so it can be served from any static host — just copy it. GitHub Pages is
already wired up (see **Hosted app** above).

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

The pure logic in `src/lib` is unit-tested (`npm test`) — dates, episode
progress, schedule grouping, CSV parsing, the ZIP reader (against real
archives), and the TV Time plan builder.

The ZIP reader is built on the browser's native `DecompressionStream`, so
importing an archive adds no runtime dependency.

## Path to a native iOS app

The codebase is deliberately Capacitor-ready: a fully static `dist/`, hash
routing (no server rewrites), relative asset paths, and an API client that
talks to TheTVDB directly over CORS (which also works from a
`capacitor://localhost` WebView origin). When you want a real App Store /
sideloaded build, on a Mac with Xcode:

```bash
npm i @capacitor/core @capacitor/cli @capacitor/ios
npx cap init PanimuTV com.panimu.tv --web-dir dist
npm run build && npx cap add ios && npx cap sync
npx cap open ios     # build & run from Xcode
```

Notes for that step:

- The existing icons (`public/icons/`, `apple-touch-icon.png`) can seed the
  Xcode asset catalog.
- Data migration is trivial: WKWebView keeps its own localStorage, so export
  a backup from the web app and import it in the native one.
- Longer-term, swapping `localStorage` persistence for Capacitor
  `Preferences`/`Filesystem` would remove eviction risk entirely — the
  storage layer is isolated in `src/store/*` and `src/api/cache.ts`, so it's
  a contained change.

## Credits

Metadata provided by [TheTVDB](https://thetvdb.com). Please consider adding
missing information or subscribing. All icons and artwork in this repo are
original (drawn for this project).
