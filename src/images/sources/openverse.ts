/**
 * Openverse: openly licensed images aggregated from Flickr, museums and more.
 * Anonymous use allows page_size ≤ 20 and roughly 20 requests a minute.
 */

import { getJson, PAGE_SIZE, SearchError } from './http'
import type { ImageSearchResult, ImageSource } from './types'

const API = 'https://api.openverse.org/v1/images/'
const NAME = 'Openverse'

interface OpenverseImage {
  id: string
  title?: string | null
  thumbnail?: string | null
  foreign_landing_url?: string | null
  creator?: string | null
  license?: string | null
  license_version?: string | null
}

interface OpenverseResponse {
  results?: OpenverseImage[]
}

export function openverseUrl(query: string, page = 1): URL {
  const url = new URL(API)
  url.search = new URLSearchParams({
    q: query,
    page_size: String(PAGE_SIZE),
    page: String(page),
    mature: 'false',
  }).toString()
  return url
}

/** "by-sa" + "2.0" → "CC BY-SA 2.0"; also handles CC0 and the Public Domain Mark. */
export function formatLicense(
  license?: string | null,
  version?: string | null,
): string | undefined {
  if (!license) return undefined
  const v = version ? ` ${version}` : ''
  if (license === 'cc0') return `CC0${v}`
  if (license === 'pdm') return `Public Domain Mark${v}`
  return `CC ${license.toUpperCase()}${v}`
}

export function mapOpenverseResponse(body: OpenverseResponse): ImageSearchResult[] {
  return (body.results ?? []).map((img) => {
    // The thumb endpoint is CORS-enabled and already a sensible size.
    const thumb = img.thumbnail ?? `${API}${img.id}/thumb/`
    const license = formatLicense(img.license, img.license_version)
    return {
      id: img.id,
      provider: 'openverse',
      title: img.title?.trim() || 'Untitled',
      thumbUrl: thumb,
      fetchUrl: thumb,
      credit: {
        provider: 'openverse',
        ...(img.foreign_landing_url && { sourceUrl: img.foreign_landing_url }),
        ...(img.creator && { author: img.creator }),
        ...(license && { license }),
      },
    }
  })
}

export const openverse: ImageSource = {
  id: 'openverse',
  name: NAME,
  blurb: 'Openly licensed images from across the web. Limited to about 20 searches a minute.',
  async search(query, opts = {}) {
    const q = query.trim()
    if (!q) return []
    const page = opts.page ?? 1
    try {
      const body = await getJson<OpenverseResponse>(openverseUrl(q, page), NAME, {
        signal: opts.signal,
      })
      return mapOpenverseResponse(body)
    } catch (err) {
      // Anonymous clients get 401 past the last page they may see: that's the end.
      if (err instanceof SearchError && err.status === 401 && page > 1) return []
      throw err
    }
  },
}
