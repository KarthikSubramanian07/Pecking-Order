/**
 * Content negotiation for agents: a request that prefers `text/markdown` gets
 * the Markdown twin of a page instead of its HTML. Pure functions, so the
 * routing is unit-tested without a Workers runtime.
 */

/** Page path → Markdown twin. Keep in sync with public/*.md and the sitemap. */
export const MARKDOWN_TWINS: Readonly<Record<string, string>> = {
  '/': '/index.md',
  '/about/': '/about.md',
  '/privacy/': '/privacy.md',
  '/contact/': '/contact.md',
}

export type Route =
  /** Not a markdown request, or a file path: let Pages serve it as usual. */
  | { kind: 'pass' }
  /** Serve this static Markdown file. */
  | { kind: 'markdown'; asset: string }
  /** Markdown was asked for a page that does not exist. */
  | { kind: 'markdown-not-found' }

interface MediaRange {
  type: string
  q: number
  order: number
}

function parseAccept(header: string): MediaRange[] {
  return header
    .split(',')
    .map((part, order) => {
      const [type = '', ...params] = part.split(';').map((s) => s.trim().toLowerCase())
      let q = 1
      for (const param of params) {
        const [key, value] = param.split('=').map((s) => s.trim())
        if (key === 'q' && value !== undefined) {
          const parsed = Number.parseFloat(value)
          q = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 1) : 0
        }
      }
      return { type, q, order }
    })
    .filter((range) => range.type !== '')
}

/** Best match for a concrete media type: exact beats `type/*` beats `*\/*`. */
function rank(ranges: MediaRange[], mediaType: string): { q: number; order: number } {
  const [major] = mediaType.split('/')
  const candidates = [
    ranges.find((r) => r.type === mediaType),
    ranges.find((r) => r.type === `${major}/*`),
    ranges.find((r) => r.type === '*/*'),
  ]
  const match = candidates.find((r) => r !== undefined)
  return match ? { q: match.q, order: match.order } : { q: 0, order: Number.POSITIVE_INFINITY }
}

/**
 * True when the client explicitly asks for Markdown and ranks it above HTML.
 * Wildcards alone (`*\/*`, `text/*`) never select Markdown, so browsers and
 * generic fetchers keep getting HTML. On a q-value tie the earlier entry wins.
 */
export function prefersMarkdown(accept: string | null | undefined): boolean {
  if (!accept) return false
  const ranges = parseAccept(accept)
  const markdown = ranges.find((r) => r.type === 'text/markdown')
  if (!markdown || markdown.q === 0) return false
  const html = rank(ranges, 'text/html')
  if (markdown.q !== html.q) return markdown.q > html.q
  return markdown.order < html.order
}

/** Normalises `/about`, `/about/index.html` and `/about/` to `/about/`. */
export function pagePath(pathname: string): string {
  let path = pathname.replace(/\/index\.html$/, '/')
  if (!path.endsWith('/')) path = `${path}/`
  return path.replace(/\/{2,}/g, '/')
}

/**
 * Client-side app routes (boards at /b/<id>) that should get the app shell.
 * Must match BOARD_RE in src/ui/router.tsx. Done here rather than in
 * _redirects because Pages skips _redirects for requests a Function handles.
 */
export function isAppRoute(pathname: string): boolean {
  return /^\/b\/[\w-]{1,64}\/?$/.test(pathname)
}

/** Paths with a file extension are assets (`/og.png`, `/llms.txt`, `/index.md`). */
function isFilePath(pathname: string): boolean {
  const last = pathname.slice(pathname.lastIndexOf('/') + 1)
  return last !== 'index.html' && last.includes('.')
}

export function route(pathname: string, accept: string | null | undefined): Route {
  if (!prefersMarkdown(accept) || isFilePath(pathname)) return { kind: 'pass' }
  const asset = MARKDOWN_TWINS[pagePath(pathname)]
  return asset ? { kind: 'markdown', asset } : { kind: 'markdown-not-found' }
}

export function notFoundMarkdown(pathname: string, origin: string): string {
  return [
    '# Not found',
    '',
    `There is no page at \`${pathname.replaceAll('`', '')}\`.`,
    '',
    `- [All pages (sitemap)](${origin}/sitemap.xml)`,
    `- [Site summary for LLMs](${origin}/llms.txt)`,
    `- [Home](${origin}/index.md)`,
    '',
  ].join('\n')
}

/** Adds `Accept` to a Vary header without duplicating it. */
export function varyOnAccept(existing: string | null): string {
  if (!existing) return 'Accept'
  const values = existing.split(',').map((v) => v.trim().toLowerCase())
  if (values.includes('accept') || values.includes('*')) return existing
  return `${existing}, Accept`
}
