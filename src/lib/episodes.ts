// Pure episode/progress logic. Season 0 (specials) is excluded from progress
// and "next up" so specials never block a show from reading as caught-up.

import type { Ep, TrackedShow } from '../types'

export const isRegular = (ep: Ep): boolean => ep.s > 0

export const hasAired = (ep: Ep, today: string): boolean => !!ep.aired && ep.aired <= today

export function sortEps(eps: Ep[]): Ep[] {
  return [...eps].sort((a, b) => a.s - b.s || a.e - b.e)
}

export interface Progress {
  watched: number
  aired: number
  total: number
  pct: number
}

export function progressOf(
  watched: Record<number, number>,
  eps: Ep[],
  today: string,
): Progress {
  const regulars = eps.filter(isRegular)
  const aired = regulars.filter((ep) => hasAired(ep, today))
  const done = aired.filter((ep) => watched[ep.id] !== undefined)
  return {
    watched: done.length,
    aired: aired.length,
    total: regulars.length,
    pct: aired.length ? done.length / aired.length : 0,
  }
}

/** First aired, unwatched, non-special episode in season/episode order. */
export function nextUp(
  watched: Record<number, number>,
  eps: Ep[],
  today: string,
): Ep | null {
  for (const ep of sortEps(eps.filter(isRegular))) {
    if (hasAired(ep, today) && watched[ep.id] === undefined) return ep
  }
  return null
}

export function episodesLeft(
  watched: Record<number, number>,
  eps: Ep[],
  today: string,
): number {
  return eps.filter(
    (ep) => isRegular(ep) && hasAired(ep, today) && watched[ep.id] === undefined,
  ).length
}

/** Future episodes (any season), soonest first. */
export function upcoming(eps: Ep[], today: string): Ep[] {
  return eps
    .filter((ep) => ep.aired && ep.aired > today)
    .sort((a, b) => a.aired!.localeCompare(b.aired!) || a.s - b.s || a.e - b.e)
}

/** All aired regular episodes up to and including the target, in order. */
export function epsUpTo(eps: Ep[], target: Ep, today: string): Ep[] {
  return sortEps(
    eps.filter(
      (ep) =>
        isRegular(ep) &&
        hasAired(ep, today) &&
        (ep.s < target.s || (ep.s === target.s && ep.e <= target.e)),
    ),
  )
}

export function epCode(ep: Ep): string {
  return `S${String(ep.s).padStart(2, '0')}E${String(ep.e).padStart(2, '0')}`
}

export function finaleLabel(ep: Ep): string | null {
  if (ep.finale === 'series') return 'Series finale'
  if (ep.finale === 'season') return 'Season finale'
  if (ep.finale === 'midseason') return 'Midseason finale'
  return null
}

export function premiereLabel(ep: Ep): string | null {
  if (!isRegular(ep) || ep.e !== 1) return null
  return ep.s === 1 ? 'Series premiere' : 'Season premiere'
}

/** Timestamp of the user's latest interaction with a show. */
export function lastActivityTs(show: TrackedShow): number {
  let max = show.addedAt
  for (const ts of Object.values(show.watched)) {
    if (ts > max) max = ts
  }
  return max
}
