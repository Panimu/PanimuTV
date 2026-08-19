import { describe, expect, it } from 'vitest'
import { buildImportPlan, classifyHeaders, normalizeTitle } from './tvtime'

const SEEN = `episode_id,tv_show_id,tv_show_name,season_number,episode_number,updated_at
1001,81189,Breaking Bad,1,1,2024-03-01 20:14:00
1002,81189,Breaking Bad,1,2,2024-03-02 21:00:00
1003,121361,Game of Thrones,2,5,2023-11-15 19:30:00
`

const FOLLOWS = `tv_show_id,tv_show_name
81189,Breaking Bad
305288,Stranger Things
`

describe('classifyHeaders', () => {
  it('detects episode files by season+episode columns', () => {
    expect(classifyHeaders(['season_number', 'episode_number'], 'seen_episode.csv')).toBe('episodes')
  })

  it('detects episode files by episode id alone', () => {
    expect(classifyHeaders(['episode_id', 'updated_at'], 'seen.csv')).toBe('episodes')
  })

  it('detects show-only files', () => {
    expect(classifyHeaders(['tv_show_id', 'tv_show_name'], 'follows.csv')).toBe('shows')
  })

  it('skips movie files regardless of columns', () => {
    expect(classifyHeaders(['season_number', 'episode_number'], 'movie_seen.csv')).toBe('movies')
  })

  it('ignores unrecognized files', () => {
    expect(classifyHeaders(['foo', 'bar'], 'notes.csv')).toBe('ignored')
  })
})

describe('classifyHeaders entity records', () => {
  it('accepts entity_id only alongside entity_type', () => {
    expect(classifyHeaders(['entity_type', 'entity_id'], 'tracking.csv')).toBe('shows')
    expect(classifyHeaders(['entity_id', 'created_at'], 'tracking.csv')).toBe('ignored')
  })

  it('does not classify profile files with a bare name column as shows', () => {
    expect(classifyHeaders(['id', 'name', 'email'], 'user.csv')).toBe('ignored')
  })
})

describe('normalizeTitle', () => {
  it('folds case, punctuation, diacritics and ampersands', () => {
    expect(normalizeTitle('Marvel’s Agents of S.H.I.E.L.D.')).toBe(
      normalizeTitle('marvels agents of shield'),
    )
    expect(normalizeTitle('Café & Croissant')).toBe('cafeandcroissant')
    expect(normalizeTitle('Law & Order')).toBe(normalizeTitle('Law and Order'))
  })
})

describe('buildImportPlan', () => {
  it('groups watched episodes per show with timestamps', () => {
    const plan = buildImportPlan([{ name: 'seen_episode.csv', text: SEEN }])
    expect(plan.shows).toHaveLength(2)
    expect(plan.totalEpisodes).toBe(3)

    const bb = plan.shows.find((s) => s.name === 'Breaking Bad')!
    expect(bb.sourceId).toBe(81189)
    expect(bb.episodes.map((e) => `${e.s}x${e.e}`)).toEqual(['1x1', '1x2'])
    expect(bb.episodes[0].watchedAt).toBe(Date.parse('2024-03-01T20:14:00'))
    expect(bb.followOnly).toBe(false)
  })

  it('merges follow-only shows and marks them as such', () => {
    const plan = buildImportPlan([
      { name: 'seen_episode.csv', text: SEEN },
      { name: 'follows.csv', text: FOLLOWS },
    ])
    // Breaking Bad appears in both files but stays one entry.
    expect(plan.shows).toHaveLength(3)
    const stranger = plan.shows.find((s) => s.name === 'Stranger Things')!
    expect(stranger.followOnly).toBe(true)
    expect(stranger.episodes).toEqual([])
    const bb = plan.shows.find((s) => s.name === 'Breaking Bad')!
    expect(bb.followOnly).toBe(false)
    expect(bb.episodes).toHaveLength(2)
  })

  it('dedupes repeated rows and keeps the earliest watch date', () => {
    const dupes = `tv_show_id,tv_show_name,season_number,episode_number,updated_at
5,Show,1,1,2024-05-05 10:00:00
5,Show,1,1,2022-01-01 10:00:00
`
    const plan = buildImportPlan([{ name: 'seen.csv', text: dupes }])
    expect(plan.shows[0].episodes).toHaveLength(1)
    expect(plan.shows[0].episodes[0].watchedAt).toBe(Date.parse('2022-01-01T10:00:00'))
  })

  it('accepts alternative column names and epoch timestamps', () => {
    const alt = `tvdb_id,series_name,season,episode,watched_at
99,Alt Show,3,7,1700000000
`
    const plan = buildImportPlan([{ name: 'export.csv', text: alt }])
    const show = plan.shows[0]
    expect(show.sourceId).toBe(99)
    expect(show.episodes[0]).toMatchObject({ s: 3, e: 7, watchedAt: 1700000000000 })
  })

  it('reports movie files as skipped and warns when nothing is found', () => {
    const plan = buildImportPlan([
      { name: 'movie_seen.csv', text: 'movie_id,name\n1,Dune\n' },
      { name: 'readme.txt', text: 'hello' },
    ])
    expect(plan.shows).toEqual([])
    expect(plan.files.find((f) => f.name === 'movie_seen.csv')?.kind).toBe('movies')
    expect(plan.warnings.join(' ')).toMatch(/movie file/i)
    expect(plan.warnings.join(' ')).toMatch(/No shows found/i)
  })

  it('ignores profile-style files with a bare name column', () => {
    const plan = buildImportPlan([
      { name: 'user.csv', text: 'id,name,email\n1,panimu,panimu@example.com\n' },
    ])
    expect(plan.shows).toEqual([])
  })

  it('uses entity_id as a show id only for series rows', () => {
    const tracking = `entity_type,entity_id,created_at
series,81189,2024-01-01 10:00:00
episode,999999,2024-01-02 10:00:00
follow,777,2024-01-03 10:00:00
show,305288,2024-01-04 10:00:00
`
    const plan = buildImportPlan([{ name: 'tracking-prod-records.csv', text: tracking }])
    expect(plan.shows.map((s) => s.sourceId!).sort((a, b) => a - b)).toEqual([81189, 305288])
  })

  it('folds a name-only bucket into the id bucket with the same title', () => {
    const seen = `tv_show_id,tv_show_name,season_number,episode_number
81189,Breaking Bad,1,1
`
    const followsByName = `show_name
BREAKING BAD
The Leftovers
`
    const plan = buildImportPlan([
      { name: 'seen.csv', text: seen },
      { name: 'follows.csv', text: followsByName },
    ])
    expect(plan.shows).toHaveLength(2)
    const bb = plan.shows.find((s) => s.sourceId === 81189)!
    expect(bb.followOnly).toBe(false)
    expect(
      plan.shows.filter((s) => normalizeTitle(s.name ?? '') === normalizeTitle('Breaking Bad')),
    ).toHaveLength(1)
  })

  it('falls back to name-only grouping when no id column exists', () => {
    const noId = `show_name,season_number,episode_number
The Wire,1,1
the wire,1,2
`
    const plan = buildImportPlan([{ name: 'seen.csv', text: noId }])
    expect(plan.shows).toHaveLength(1)
    expect(plan.shows[0].sourceId).toBeUndefined()
    expect(plan.shows[0].episodes).toHaveLength(2)
  })
})
