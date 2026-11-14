import type { ImageCredit } from '@/core/types'

export interface ImageSearchResult {
  /** Unique within the provider. */
  id: string
  provider: ImageCredit['provider']
  title: string
  /** Small preview for the results grid. */
  thumbUrl: string
  /** CORS-fetchable URL used when the user picks the result (≈500px). */
  fetchUrl: string
  credit: ImageCredit
}

export interface SearchOptions {
  signal?: AbortSignal
  page?: number
}

export interface ImageSource {
  id: string
  name: string
  /** One line shown under the source tab, e.g. licence notes. */
  blurb: string
  search(query: string, opts?: SearchOptions): Promise<ImageSearchResult[]>
}
