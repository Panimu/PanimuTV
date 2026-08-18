// Date helpers. All app dates are local-timezone YYYY-MM-DD strings, which
// compare correctly with plain string comparison.

export const DAY_MS = 86_400_000

export function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayISO(): string {
  return toISO(new Date())
}

/** Parse YYYY-MM-DD as local midnight (never UTC). */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function addDays(iso: string, days: number): string {
  const d = parseISO(iso)
  d.setDate(d.getDate() + days)
  return toISO(d)
}

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / DAY_MS)
}

export function fmtDate(iso: string): string {
  return parseISO(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function relDay(iso: string, today = todayISO()): string | null {
  const n = daysBetween(today, iso)
  if (n === 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  if (n === -1) return 'Yesterday'
  return null
}

/** Short human phrase: Today / Tomorrow / in 5 days / 3 days ago / Mar 4, 2026. */
export function relTime(iso: string, today = todayISO()): string {
  const n = daysBetween(today, iso)
  if (n === 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  if (n === -1) return 'Yesterday'
  if (n > 1 && n < 30) return `in ${n} days`
  if (n < -1 && n > -30) return `${-n} days ago`
  return fmtDate(iso)
}

/** Heading for a schedule day group, e.g. "Today · Mon, Aug 18". */
export function fmtDayHeading(iso: string, today = todayISO()): string {
  const d = parseISO(iso)
  const weekday = d.toLocaleDateString(undefined, { weekday: 'short' })
  const monthDay = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const year = d.getFullYear() !== parseISO(today).getFullYear() ? ` ${d.getFullYear()}` : ''
  const rel = relDay(iso, today)
  const base = `${weekday}, ${monthDay}${year}`
  return rel ? `${rel} · ${base}` : base
}

/** Format minutes as "3d 14h" / "5h 20m" / "45m". */
export function fmtMinutes(totalMinutes: number): string {
  const mins = Math.round(totalMinutes)
  const days = Math.floor(mins / 1440)
  const hours = Math.floor((mins % 1440) / 60)
  const minutes = mins % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}
