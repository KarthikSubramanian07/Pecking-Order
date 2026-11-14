/**
 * The site's canonical public origin. Every absolute URL in `index.html` and
 * `public/` (canonical links, OpenGraph, sitemap, llms.txt…) is written with
 * this value, so they stay valid static files in the repo.
 *
 * To serve from another domain, set `SITE_ORIGIN` at build time
 * (e.g. `SITE_ORIGIN=https://rank.example npm run build`); the build rewrites
 * every occurrence in `dist/`. The deploy workflow reads it from the
 * `SITE_ORIGIN` repository variable.
 */
export const DEFAULT_ORIGIN = 'https://pecking-order.pages.dev'

/** Emitted text files that may contain absolute URLs. */
export const ORIGIN_FILE_PATTERN = /\.(html|xml|txt|md|webmanifest)$/

export function resolveOrigin(env: string | undefined): string {
  const origin = (env ?? '').trim().replace(/\/+$/, '')
  if (!origin) return DEFAULT_ORIGIN
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(origin)) {
    throw new Error(`SITE_ORIGIN must be a bare https origin, got "${env}"`)
  }
  return origin
}
