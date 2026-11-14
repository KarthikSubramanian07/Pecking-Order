/** Shared request plumbing for the image search sources. */
import { parseInertHtml } from '@/security/trustedTypes'
import { deadline } from '../net'

const SEARCH_TIMEOUT_MS = 15_000
export const PAGE_SIZE = 20

/**
 * Browsers forbid setting User-Agent, so Wikimedia asks for this header
 * instead; their CORS preflight allows it.
 */
export const WIKIMEDIA_HEADERS = {
  'Api-User-Agent': 'PeckingOrder/0.1 (https://github.com/KarthikSubramanian07/Pecking-Order)',
}

export class SearchError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'SearchError'
  }
}

/** GETs JSON, turning every failure mode into a message fit for the search panel. */
export async function getJson<T>(
  url: URL,
  sourceName: string,
  opts: { signal?: AbortSignal; headers?: Record<string, string> } = {},
): Promise<T> {
  const timer = deadline(opts.signal, SEARCH_TIMEOUT_MS)
  try {
    let res: Response
    try {
      res = await fetch(url.href, {
        headers: opts.headers,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: timer.signal,
      })
    } catch {
      throw new SearchError(`Couldn't reach ${sourceName}. Check your connection and try again.`)
    }
    if (res.status === 429) {
      throw new SearchError(`${sourceName} is rate limited. Try again in a minute.`, 429)
    }
    if (!res.ok)
      throw new SearchError(`${sourceName} search failed (HTTP ${res.status}).`, res.status)
    return (await res.json()) as T
  } catch (err) {
    if (opts.signal?.aborted) throw opts.signal.reason
    if (timer.timedOut) throw new SearchError(`${sourceName} took too long to answer.`)
    throw err
  } finally {
    timer.dispose()
  }
}

/** MediaWiki reports some errors with HTTP 200 and an `error` object. */
export interface MediaWikiResponse<P> {
  error?: { info?: string }
  query?: { pages?: P[] }
}

export function mediaWikiPages<P extends { index?: number }>(
  body: MediaWikiResponse<P>,
  sourceName: string,
): P[] {
  if (body.error) {
    throw new SearchError(`${sourceName} search failed: ${body.error.info ?? 'unknown error'}.`)
  }
  // formatversion=2 returns pages in arbitrary order; `index` is the rank.
  return [...(body.query?.pages ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
}

/** Plain text from an HTML fragment, via an inert DOMParser document. Never rendered. */
export function htmlToText(html: string): string {
  const doc = parseInertHtml(html)
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * The same Wikimedia thumbnail at a smaller standard width, for the results
 * grid. Only standard steps (120, 250, 330, 500, 960) are served; others 400.
 */
export function wikimediaThumbAt(url: string, width: 120 | 250 | 330 | 500 | 960): string {
  try {
    const u = new URL(url)
    if (!u.pathname.includes('/thumb/')) return url
    u.pathname = u.pathname.replace(/\/\d+px-([^/]+)$/, `/${width}px-$1`)
    return u.href
  } catch {
    return url
  }
}
