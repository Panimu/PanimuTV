// Local-storage accounting. Everything this app owns is namespaced under
// `panimu.`, so usage can be broken down per area and reported to the user.

export interface StorageBucket {
  id: string
  label: string
  hint: string
  bytes: number
  entries: number
}

export interface StorageReport {
  buckets: StorageBucket[]
  totalBytes: number
  /** Rough ceiling for localStorage in most browsers (~5 MB of UTF-16). */
  limitBytes: number
  /** Whole-origin usage reported by the browser (includes the offline cache). */
  originUsageBytes?: number
  originQuotaBytes?: number
}

/**
 * localStorage is measured in UTF-16 code units in every major browser, so a
 * stored character costs 2 bytes and the key counts too.
 */
const bytesOf = (key: string, value: string) => (key.length + value.length) * 2

export const LOCALSTORAGE_LIMIT_BYTES = 5 * 1024 * 1024

const BUCKETS = [
  {
    id: 'library',
    label: 'Your library',
    hint: 'Shows, watch history, ratings',
    match: (k: string) => k.startsWith('panimu.library.'),
  },
  {
    id: 'cache',
    label: 'Cached TheTVDB data',
    hint: 'Episode lists, series info, discover feeds',
    match: (k: string) => k.startsWith('panimu.cache.'),
  },
  {
    id: 'settings',
    label: 'Settings',
    hint: 'API key, language, filters',
    match: (k: string) => k.startsWith('panimu.settings.') || k.startsWith('panimu.apimode.'),
  },
  {
    id: 'auth',
    label: 'API session',
    hint: 'TheTVDB access token',
    match: (k: string) => k.startsWith('panimu.auth.'),
  },
]

/** Measure what PanimuTV is storing in this browser, bucket by bucket. */
export function measureStorage(): StorageReport {
  const buckets: StorageBucket[] = BUCKETS.map((b) => ({
    id: b.id,
    label: b.label,
    hint: b.hint,
    bytes: 0,
    entries: 0,
  }))
  const other: StorageBucket = {
    id: 'other',
    label: 'Other PanimuTV data',
    hint: 'Anything left over from older versions',
    bytes: 0,
    entries: 0,
  }

  let totalBytes = 0
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key || !key.startsWith('panimu.')) continue
    const size = bytesOf(key, localStorage.getItem(key) ?? '')
    totalBytes += size
    const idx = BUCKETS.findIndex((b) => b.match(key))
    const bucket = idx >= 0 ? buckets[idx] : other
    bucket.bytes += size
    bucket.entries++
  }
  if (other.entries > 0) buckets.push(other)

  return {
    buckets: buckets.filter((b) => b.entries > 0),
    totalBytes,
    limitBytes: LOCALSTORAGE_LIMIT_BYTES,
  }
}

/**
 * Ask the browser for whole-origin usage (localStorage + the service worker's
 * offline caches). Not supported everywhere, hence the optional fields.
 */
export async function measureOrigin(): Promise<Pick<StorageReport, 'originUsageBytes' | 'originQuotaBytes'>> {
  try {
    const estimate = await navigator.storage?.estimate?.()
    return {
      originUsageBytes: estimate?.usage,
      originQuotaBytes: estimate?.quota,
    }
  } catch {
    return {}
  }
}

/** Human-readable byte size: 812 B / 44.6 KB / 1.8 MB. */
export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
