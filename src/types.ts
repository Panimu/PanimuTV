// Domain types shared by the store, pure libs, and UI.
// This module must stay free of browser/store imports so tests can use it in node.

export type UserStatus = 'watching' | 'planned' | 'completed' | 'onhold' | 'dropped'

export const USER_STATUS_ORDER: UserStatus[] = ['watching', 'planned', 'onhold', 'completed', 'dropped']

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  watching: 'Watching',
  planned: 'Plan to Watch',
  onhold: 'On Hold',
  completed: 'Completed',
  dropped: 'Dropped',
}

/** Minimal episode record kept in the local cache (one list per series). */
export interface Ep {
  id: number
  /** season number (0 = specials) */
  s: number
  /** episode number within the season */
  e: number
  name: string
  /** air date as YYYY-MM-DD, or null when unscheduled */
  aired: string | null
  /** runtime in minutes */
  runtime: number | null
  image?: string
  overview?: string
  /** 'series' | 'season' | 'midseason' when TheTVDB flags a finale */
  finale?: string | null
}

/** A show in the user's library, persisted to localStorage. */
export interface TrackedShow {
  id: number
  name: string
  slug?: string
  poster?: string
  fanart?: string
  year?: string
  /** TheTVDB airing status name: Continuing | Ended | Upcoming | Cancelled */
  airStatus?: string
  network?: string
  /** average runtime in minutes */
  runtime?: number
  genres: string[]
  overview?: string
  firstAired?: string
  /** Air date of the most recent episode — lets the schedule skip fetching
   *  finished shows whose run ended before the visible window. */
  lastAired?: string
  nextAired?: string
  addedAt: number
  updatedAt: number
  lastSyncedAt?: number
  userStatus: UserStatus
  favorite: boolean
  /** user rating 1–10 */
  rating?: number
  /** episode id → watched-at timestamp (ms) */
  watched: Record<number, number>
}
