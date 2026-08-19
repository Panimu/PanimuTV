// Title matching shared by the TV Time importer, the My Shows filter, and
// search-result ranking. All comparisons are case-, diacritic- and
// punctuation-insensitive.

import type { SearchResult } from '../api/types'

/**
 * Loose title key: lowercase, no diacritics, separators removed entirely so
 * dotted initialisms compare equal to their spelled forms
 * ("S.H.I.E.L.D." ≡ "SHIELD").
 */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '')
}

/** Normalized word tokens, keeping word boundaries. */
export function titleTokens(title: string): string[] {
  return title
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** Drop parenthetical qualifiers: "The Office (US)" → "The Office". */
function stripQualifiers(title: string): string {
  return title.replace(/\s*\([^)]*\)/g, ' ')
}

function stripLeadingArticle(tokens: string[]): string[] {
  return tokens.length > 1 && ['the', 'a', 'an'].includes(tokens[0]) ? tokens.slice(1) : tokens
}

/**
 * Similarity between two titles in [0, 1], as the best of four signals:
 * - 1.00  exact normalized match
 * - 0.95  equal after dropping parenthetical qualifiers ("(US)", "(2005)")
 *         and a leading article
 * - up to 0.95  one title contained in the other (≥ 4 chars, scaled by how
 *         much of the longer title it covers) — partial titles like
 *         "Deep Space Nine" vs "Star Trek: Deep Space Nine"
 * - up to 0.90  word overlap (order-insensitive Jaccard)
 */
export function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a)
  const nb = normalizeTitle(b)
  if (!na || !nb) return 0
  if (na === nb) return 1

  let score = 0

  const coreA = stripLeadingArticle(titleTokens(stripQualifiers(a))).join('')
  const coreB = stripLeadingArticle(titleTokens(stripQualifiers(b))).join('')
  if (coreA && coreA === coreB) score = 0.95

  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na]
  if (short.length >= 4 && long.includes(short)) {
    score = Math.max(score, 0.5 + 0.45 * (short.length / long.length))
  }

  const tokensA = new Set(titleTokens(a))
  const tokensB = new Set(titleTokens(b))
  if (tokensA.size && tokensB.size) {
    let common = 0
    for (const token of tokensA) if (tokensB.has(token)) common++
    if (common > 0) {
      const jaccard = common / (tokensA.size + tokensB.size - common)
      score = Math.max(score, 0.4 + 0.5 * jaccard)
    }
  }

  return score
}

/**
 * Interactive filter matching: true when the query appears inside the title
 * (normalized, so mid-word fragments like "ffic" hit "The Office") or when
 * every query word is a prefix of some title word, in any order
 * ("bad break" hits "Breaking Bad").
 */
export function matchesQuery(title: string, query: string): boolean {
  const q = query.trim()
  if (!q) return true
  const nq = normalizeTitle(q)
  if (nq && normalizeTitle(title).includes(nq)) return true
  const queryTokens = titleTokens(q)
  if (!queryTokens.length) return false
  const words = titleTokens(title)
  return queryTokens.every((qt) => words.some((w) => w.startsWith(qt)))
}

/** Best similarity between a query and any of a result's known names. */
export function searchResultScore(result: SearchResult, query: string): number {
  const variants = [
    result.name,
    ...Object.values(result.translations ?? {}),
    ...(result.aliases ?? []),
  ]
  let best = 0
  for (const variant of variants) {
    if (!variant) continue
    best = Math.max(best, titleSimilarity(query, variant))
    if (best === 1) break
  }
  return best
}

/**
 * Order search results by similarity to the query, keeping the API's own
 * relevance order as the tie-breaker (Array.prototype.sort is stable).
 */
export function rankSearchResults(results: SearchResult[], query: string): SearchResult[] {
  return results
    .map((result, index) => ({ result, index, score: searchResultScore(result, query) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.result)
}
