/**
 * Wikipedia article lead images. Prefix search over article titles makes it
 * the best source for named things: films, people, foods, languages.
 */

import {
  getJson,
  type MediaWikiResponse,
  mediaWikiPages,
  PAGE_SIZE,
  WIKIMEDIA_HEADERS,
  wikimediaThumbAt,
} from './http'
import type { ImageSearchResult, ImageSource } from './types'

const API = 'https://en.wikipedia.org/w/api.php'
const NAME = 'Wikipedia'

interface WikipediaPage {
  pageid: number
  title: string
  index?: number
  fullurl?: string
  thumbnail?: { source?: string }
}

export function wikipediaUrl(query: string, page = 1): URL {
  const url = new URL(API)
  url.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    origin: '*',
    generator: 'prefixsearch',
    gpssearch: query,
    gpslimit: String(PAGE_SIZE),
    gpsoffset: String((page - 1) * PAGE_SIZE),
    prop: 'pageimages|info',
    piprop: 'thumbnail',
    pithumbsize: '500',
    pilimit: String(PAGE_SIZE),
    inprop: 'url',
  }).toString()
  return url
}

export function mapWikipediaResponse(body: MediaWikiResponse<WikipediaPage>): ImageSearchResult[] {
  const results: ImageSearchResult[] = []
  for (const page of mediaWikiPages(body, NAME)) {
    const src = page.thumbnail?.source
    if (!src) continue
    results.push({
      id: String(page.pageid),
      provider: 'wikipedia',
      title: page.title,
      thumbUrl: wikimediaThumbAt(src, 250),
      fetchUrl: src,
      credit: {
        provider: 'wikipedia',
        sourceUrl: page.fullurl ?? `https://en.wikipedia.org/?curid=${page.pageid}`,
        // Lead images vary: many are freely licensed, some are fair use.
        license: 'See Wikipedia',
      },
    })
  }
  return results
}

export const wikipedia: ImageSource = {
  id: 'wikipedia',
  name: NAME,
  blurb: 'Lead images from Wikipedia articles. Best for people, films, foods and places.',
  async search(query, opts = {}) {
    const q = query.trim()
    if (!q) return []
    const body = await getJson<MediaWikiResponse<WikipediaPage>>(wikipediaUrl(q, opts.page), NAME, {
      signal: opts.signal,
      headers: WIKIMEDIA_HEADERS,
    })
    return mapWikipediaResponse(body)
  },
}
