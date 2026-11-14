/**
 * Turns a pack item's image reference into a CORS-fetchable image URL plus
 * attribution.
 *
 * This file is also run directly by Node (scripts/verify-pack-images.mjs, via
 * type stripping) so contributors check images exactly the way the app
 * resolves them. Keep it free of `@/` runtime imports and TS-only syntax; the
 * one runtime import is relative, with its extension, so Node resolves it.
 */
import type { ImageCredit } from '@/core/types'
import { parseInertHtml } from '../security/trustedTypes.ts'
import type { PackItemSpec } from './types'

export interface ResolvedImage {
  url: string
  credit: ImageCredit
}

/** Wikimedia asks API clients to identify themselves; browsers can't set User-Agent. */
export const WIKIMEDIA_HEADERS: Readonly<Record<string, string>> = {
  'Api-User-Agent': 'PeckingOrder/0.1 (https://github.com/KarthikSubramanian07/Pecking-Order)',
}

/** Wikimedia only renders thumbnails at standard steps; anything else is a 400/429. */
const TARGET_WIDTH = 500

type Json = Record<string, unknown>
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)

/**
 * Resolves the image for one pack item. Returns null for text-only items and
 * articles without a lead image; throws when a lookup fails (missing article
 * or file, network error) so callers can report why.
 */
export async function resolvePackImage(
  item: PackItemSpec,
  signal?: AbortSignal,
): Promise<ResolvedImage | null> {
  if (item.wikipedia) return resolveWikipedia(item.wikipedia, signal)
  if (item.commons) return resolveCommons(item.commons, signal)
  if (item.image) return { url: item.image, credit: { provider: 'pack', sourceUrl: item.image } }
  return null
}

async function getJson(url: string, signal: AbortSignal | undefined, what: string) {
  const res = await fetch(url, {
    headers: WIKIMEDIA_HEADERS,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    signal,
  })
  if (res.status === 404) throw new Error(`${what} not found`)
  if (!res.ok) throw new Error(`${what}: HTTP ${res.status}`)
  return (await res.json()) as unknown
}

async function resolveWikipedia(
  title: string,
  signal: AbortSignal | undefined,
): Promise<ResolvedImage | null> {
  // REST titles use underscores; encodeURIComponent keeps "AC/DC"-style slashes intact.
  const path = encodeURIComponent(title.trim().replaceAll(' ', '_'))
  const data = await getJson(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${path}`,
    signal,
    `Wikipedia article "${title}"`,
  )
  if (!isObj(data)) throw new Error(`Wikipedia article "${title}": unexpected response`)
  if (data.type === 'disambiguation') {
    throw new Error(`Wikipedia article "${title}" is a disambiguation page`)
  }
  const thumb = isObj(data.thumbnail) ? str(data.thumbnail.source) : undefined
  if (!thumb) return null
  const original = isObj(data.originalimage) ? data.originalimage : {}
  const pageUrl =
    isObj(data.content_urls) && isObj(data.content_urls.desktop)
      ? str(data.content_urls.desktop.page)
      : undefined
  const credit: ImageCredit = { provider: 'wikipedia', license: 'See Wikipedia' }
  if (pageUrl) credit.sourceUrl = pageUrl
  return {
    url: upscaleThumb(thumb, original.width),
    credit,
  }
}

/**
 * The summary API hands out 330px thumbnails. Swap in the 500px step when the
 * original is big enough, or is an SVG (it scales freely, and the summary
 * reports its tiny intrinsic size); asking for a thumbnail wider than a raster
 * original fails, so smaller images stay as they are.
 */
export function upscaleThumb(thumb: string, originalWidth: unknown): string {
  const m = /^(.*\/thumb\/.+\/)(\d+)px-([^/]+)$/.exec(thumb.split('?')[0] ?? '')
  if (!m) return thumb
  const current = Number(m[2])
  const isSvg = /\.svg\/$/i.test(m[1] ?? '')
  const bigEnough = typeof originalWidth === 'number' && originalWidth >= TARGET_WIDTH
  if (current >= TARGET_WIDTH || !(isSvg || bigEnough)) return thumb
  const query = thumb.includes('?') ? thumb.slice(thumb.indexOf('?')) : ''
  return `${m[1]}${TARGET_WIDTH}px-${m[3]}${query}`
}

async function resolveCommons(
  file: string,
  signal: AbortSignal | undefined,
): Promise<ResolvedImage | null> {
  const params = new URLSearchParams({
    action: 'query',
    titles: file,
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiextmetadatafilter: 'Artist|LicenseShortName',
    iiurlwidth: String(TARGET_WIDTH),
    origin: '*',
    format: 'json',
    formatversion: '2',
  })
  const data = await getJson(
    `https://commons.wikimedia.org/w/api.php?${params}`,
    signal,
    `Commons file "${file}"`,
  )
  const page =
    isObj(data) && isObj(data.query) && Array.isArray(data.query.pages)
      ? data.query.pages[0]
      : undefined
  if (!isObj(page) || page.missing || page.invalid)
    throw new Error(`Commons file "${file}" not found`)
  const info = Array.isArray(page.imageinfo) ? page.imageinfo[0] : undefined
  if (!isObj(info)) throw new Error(`Commons file "${file}" has no image info`)
  const url = str(info.thumburl) ?? str(info.url)
  if (!url) return null

  const meta = isObj(info.extmetadata) ? info.extmetadata : {}
  const field = (key: string): string | undefined => {
    const entry = meta[key]
    return isObj(entry) && typeof entry.value === 'string' ? htmlToText(entry.value) : undefined
  }
  const credit: ImageCredit = { provider: 'wikimedia' }
  const sourceUrl = str(info.descriptionurl)
  if (sourceUrl) credit.sourceUrl = sourceUrl
  const author = field('Artist')
  if (author) credit.author = author
  const license = field('LicenseShortName')
  if (license) credit.license = license
  return { url, credit }
}

/** Commons metadata is HTML. Parse it inertly and keep only the text, never inject it. */
export function htmlToText(html: string): string | undefined {
  const doc = parseInertHtml(html)
  for (const el of doc.querySelectorAll('script, style')) el.remove()
  const text = (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
  return text || undefined
}
