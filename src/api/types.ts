// Shapes of the TheTVDB v4 API responses (only the fields this app reads).
// Reference: https://thetvdb.github.io/v4-api/

export interface TvdbEnvelope<T> {
  status: string
  data: T
  links?: {
    prev?: string | null
    self?: string | null
    next?: string | null
    total_items?: number
    page_size?: number
  }
}

export interface SearchResult {
  objectID: string
  tvdb_id: string
  name: string
  slug?: string
  image_url?: string
  thumbnail?: string
  year?: string
  overview?: string
  overviews?: Record<string, string>
  translations?: Record<string, string>
  primary_language?: string
  status?: string
  type: string
  network?: string
  country?: string
  first_air_time?: string
}

export interface RawStatus {
  id: number
  name: string
}

export interface SeriesBase {
  id: number
  name: string
  slug: string
  image?: string
  firstAired?: string
  lastAired?: string
  nextAired?: string
  score?: number
  status?: RawStatus
  originalCountry?: string
  originalLanguage?: string
  averageRuntime?: number | null
  overview?: string
  year?: string
}

export interface Company {
  id: number
  name: string
  companyType?: { companyTypeId: number; companyTypeName: string }
}

export interface ArtworkBase {
  id: number
  image: string
  thumbnail?: string
  /** series artwork types: 1 = banner, 2 = poster, 3 = background */
  type: number
  score?: number
}

export interface TranslationRec {
  language: string
  name?: string
  overview?: string
}

export interface Genre {
  id: number
  name: string
  slug?: string
}

export interface SeriesExtended extends SeriesBase {
  artworks?: ArtworkBase[]
  companies?: Company[]
  genres?: Genre[]
  originalNetwork?: Company
  latestNetwork?: Company
  airsTime?: string
  airsDays?: Record<string, boolean>
  country?: string
  translations?: {
    nameTranslations?: TranslationRec[]
    overviewTranslations?: TranslationRec[]
  }
}

export interface RawEpisode {
  id: number
  seriesId: number
  name?: string
  aired?: string | null
  runtime?: number | null
  overview?: string
  image?: string
  number: number
  seasonNumber: number
  finaleType?: string | null
  year?: string
}
