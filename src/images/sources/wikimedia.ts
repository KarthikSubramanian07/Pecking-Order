/**
 * Wikimedia Commons: millions of freely licensed photos. Thumbnails come from
 * `imageinfo.thumburl`; Special:FilePath is avoided because its redirects
 * carry no CORS headers.
 */
import { labelFromFileName } from '../labels'
import {
  getJson,
  htmlToText,
  type MediaWikiResponse,
  mediaWikiPages,
  PAGE_SIZE,
  WIKIMEDIA_HEADERS,
  wikimediaThumbAt,
} from './http'
import type { ImageSearchResult, ImageSource } from './types'

const API = 'https://commons.wikimedia.org/w/api.php'
const NAME = 'Wikimedia Commons'

interface CommonsPage {
  pageid: number
  title: string
  index?: number
  imageinfo?: {
    thumburl?: string
    descriptionurl?: string
    mime?: string
    extmetadata?: Record<string, { value?: unknown } | undefined>
  }[]
}

export function commonsUrl(query: string, page = 1): URL {
  const url = new URL(API)
  url.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    origin: '*',
    generator: 'search',
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: String(PAGE_SIZE),
    gsroffset: String((page - 1) * PAGE_SIZE),
    prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata',
    iiextmetadatafilter: 'LicenseShortName|Artist|AttributionRequired',
    // Must be a standard thumbnail step, or the thumb host answers 400.
    iiurlwidth: '500',
  }).toString()
  return url
}

/** extmetadata values are HTML strings (Artist is usually a link); keep only text. */
function metaText(meta: Record<string, { value?: unknown } | undefined> | undefined, key: string) {
  const value = meta?.[key]?.value
  return typeof value === 'string' ? htmlToText(value) || undefined : undefined
}

/** "File:Red Panda (24986761703).jpg" → "Red Panda". Flickr imports append photo ids. */
function fileTitle(title: string): string {
  const name = title.replace(/^File:/, '').replace(/\s*\(\d{6,}\)(?=\.\w+$)/, '')
  return labelFromFileName(name)
}

export function mapCommonsResponse(body: MediaWikiResponse<CommonsPage>): ImageSearchResult[] {
  const results: ImageSearchResult[] = []
  for (const page of mediaWikiPages(body, NAME)) {
    const info = page.imageinfo?.[0]
    if (!info?.thumburl || !info.mime?.startsWith('image/')) continue
    const author = metaText(info.extmetadata, 'Artist')
    const license = metaText(info.extmetadata, 'LicenseShortName')
    results.push({
      id: String(page.pageid),
      provider: 'wikimedia',
      title: fileTitle(page.title),
      thumbUrl: wikimediaThumbAt(info.thumburl, 250),
      fetchUrl: info.thumburl,
      credit: {
        provider: 'wikimedia',
        sourceUrl: info.descriptionurl ?? `https://commons.wikimedia.org/?curid=${page.pageid}`,
        ...(author && { author }),
        ...(license && { license }),
      },
    })
  }
  return results
}

export const wikimedia: ImageSource = {
  id: 'wikimedia',
  name: NAME,
  blurb: 'Freely licensed photos from Wikimedia Commons. Credit is saved with each image.',
  async search(query, opts = {}) {
    const q = query.trim()
    if (!q) return []
    const body = await getJson<MediaWikiResponse<CommonsPage>>(commonsUrl(q, opts.page), NAME, {
      signal: opts.signal,
      headers: WIKIMEDIA_HEADERS,
    })
    return mapCommonsResponse(body)
  },
}
