// Tiny TTL cache on top of localStorage. Every entry lives under one prefix so
// it can be sized and cleared independently of the user's library data.

const PREFIX = 'panimu.cache.'

interface Entry<T> {
  t: number
  v: T
}

function read<T>(key: string): Entry<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Entry<T>
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.t !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

/** Get a cached value regardless of its age. */
export function cachePeek<T>(key: string): T | null {
  const entry = read<T>(key)
  return entry ? entry.v : null
}

/** Get a cached value if it is younger than maxAgeMs. */
export function cacheGet<T>(key: string, maxAgeMs: number): T | null {
  const entry = read<T>(key)
  if (!entry) return null
  if (Date.now() - entry.t > maxAgeMs) return null
  return entry.v
}

export function cacheSet<T>(key: string, value: T): void {
  const raw = JSON.stringify({ t: Date.now(), v: value } satisfies Entry<T>)
  try {
    localStorage.setItem(PREFIX + key, raw)
  } catch {
    // Quota exceeded: evict the oldest half of the cache and try once more.
    evictOldest()
    try {
      localStorage.setItem(PREFIX + key, raw)
    } catch {
      // Give up quietly — the cache is best-effort.
    }
  }
}

function evictOldest(): void {
  const entries: { key: string; t: number }[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key || !key.startsWith(PREFIX)) continue
    const entry = read<unknown>(key.slice(PREFIX.length))
    entries.push({ key, t: entry?.t ?? 0 })
  }
  entries.sort((a, b) => a.t - b.t)
  const toRemove = entries.slice(0, Math.max(1, Math.ceil(entries.length / 2)))
  for (const { key } of toRemove) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  }
}

/** Remove every cache entry. Returns how many were removed. */
export function cacheClear(): number {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(PREFIX)) keys.push(key)
  }
  for (const key of keys) localStorage.removeItem(key)
  return keys.length
}

export function cacheStats(): { entries: number; bytes: number } {
  let entries = 0
  let bytes = 0
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key || !key.startsWith(PREFIX)) continue
    entries++
    bytes += key.length + (localStorage.getItem(key)?.length ?? 0)
  }
  return { entries, bytes }
}
