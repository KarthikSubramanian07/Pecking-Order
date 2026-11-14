/**
 * Build-time Content Security Policy helpers.
 *
 * public/_headers allows inline styles by hash, not with 'unsafe-inline'. Vite
 * minifies the loading-shell <style> in index.html, so its hash is only known
 * after a build: the `csp-hashes` plugin in vite.config.ts swaps the
 * placeholder below for the real hashes in dist/_headers, and fails the build
 * if index.html ever grows an inline script the policy would block.
 */
import { createHash } from 'node:crypto'

/** Stands in for the inline style hashes in public/_headers until a build fills it in. */
export const STYLE_HASHES_PLACEHOLDER = "'inline-style-hashes'"

const sha256 = (text: string) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`

/** CSP source expressions for every inline <style> block, in document order. */
export function inlineStyleHashes(html: string): string[] {
  return [...html.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi)].map((m) =>
    sha256(m[1] ?? ''),
  )
}

/**
 * Inline <script> blocks a browser would execute. JSON-LD and other data
 * blocks are never executed, so script-src does not apply to them.
 */
export function executableInlineScripts(html: string): string[] {
  const DATA_TYPES = /^application\/(ld\+)?json$/i
  return [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .filter(([, attrs = '']) => !/\ssrc\s*=/i.test(attrs))
    .filter(([, attrs = '']) => {
      const type = /\stype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1] ?? ''
      return !DATA_TYPES.test(type)
    })
    .map(([, , body = '']) => body)
}

/** Fills the placeholder in a _headers file with the hashes of `html`'s inline styles. */
export function applyStyleHashes(headers: string, html: string): string {
  if (!headers.includes(STYLE_HASHES_PLACEHOLDER)) {
    throw new Error(`_headers has no ${STYLE_HASHES_PLACEHOLDER} placeholder in style-src`)
  }
  const hashes = inlineStyleHashes(html).join(' ')
  return headers.replaceAll(
    hashes ? STYLE_HASHES_PLACEHOLDER : ` ${STYLE_HASHES_PLACEHOLDER}`,
    hashes,
  )
}
