import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TrackedShow, UserStatus } from '../types'

interface LibraryState {
  shows: Record<number, TrackedShow>
  add: (show: TrackedShow) => void
  remove: (id: number) => void
  patch: (id: number, patch: Partial<TrackedShow>) => void
  setStatus: (id: number, status: UserStatus) => void
  toggleFavorite: (id: number) => void
  setRating: (id: number, rating?: number) => void
  setWatched: (id: number, episodeIds: number[], watched: boolean) => void
  mergeWatched: (id: number, watched: Record<number, number>) => void
  replaceAll: (shows: Record<number, TrackedShow>) => void
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set) => ({
      shows: {},

      add: (show) =>
        set((st) => ({ shows: { ...st.shows, [show.id]: show } })),

      remove: (id) =>
        set((st) => {
          const shows = { ...st.shows }
          delete shows[id]
          return { shows }
        }),

      patch: (id, patch) =>
        set((st) => {
          const cur = st.shows[id]
          if (!cur) return st
          return { shows: { ...st.shows, [id]: { ...cur, ...patch, updatedAt: Date.now() } } }
        }),

      setStatus: (id, status) =>
        set((st) => {
          const cur = st.shows[id]
          if (!cur) return st
          return { shows: { ...st.shows, [id]: { ...cur, userStatus: status, updatedAt: Date.now() } } }
        }),

      toggleFavorite: (id) =>
        set((st) => {
          const cur = st.shows[id]
          if (!cur) return st
          return { shows: { ...st.shows, [id]: { ...cur, favorite: !cur.favorite, updatedAt: Date.now() } } }
        }),

      setRating: (id, rating) =>
        set((st) => {
          const cur = st.shows[id]
          if (!cur) return st
          return { shows: { ...st.shows, [id]: { ...cur, rating, updatedAt: Date.now() } } }
        }),

      setWatched: (id, episodeIds, watched) =>
        set((st) => {
          const cur = st.shows[id]
          if (!cur) return st
          const map = { ...cur.watched }
          const now = Date.now()
          for (const epId of episodeIds) {
            if (watched) map[epId] = now
            else delete map[epId]
          }
          return { shows: { ...st.shows, [id]: { ...cur, watched: map, updatedAt: now } } }
        }),

      // Additive merge used by imports: existing history is never removed,
      // and the earliest known watch date wins.
      mergeWatched: (id, incoming) =>
        set((st) => {
          const cur = st.shows[id]
          if (!cur) return st
          const map = { ...cur.watched }
          for (const [epId, ts] of Object.entries(incoming)) {
            const key = Number(epId)
            const existing = map[key]
            map[key] = existing !== undefined ? Math.min(existing, ts) : ts
          }
          return { shows: { ...st.shows, [id]: { ...cur, watched: map, updatedAt: Date.now() } } }
        }),

      replaceAll: (shows) => set({ shows }),
    }),
    { name: 'panimu.library.v1', version: 1 },
  ),
)
