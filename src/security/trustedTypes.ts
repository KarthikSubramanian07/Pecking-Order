/**
 * Trusted Types. The production CSP sets `require-trusted-types-for 'script'`
 * and allows exactly one policy, this one, so the browser refuses any string
 * that reaches an HTML or script-URL sink (innerHTML, DOMParser, new Worker...)
 * unless it went through the two narrow doors below.
 *
 * - `parseInertHtml` parses copied HTML or API metadata into a detached,
 *   script-less document that is only ever read, never attached.
 * - `trustedScriptUrl` lets same-origin script URLs (our own worker) through.
 *
 * The policy object never leaves this module. Where Trusted Types are not
 * supported (or in Node, which runs the pack resolver), plain strings are used.
 *
 * Imported by src/packs/resolve.ts, which Node also runs directly: keep this
 * file free of `@/` imports and TS-only runtime syntax.
 */

interface Policy {
  createHTML(input: string): unknown
  createScriptURL(input: string): unknown
}

interface TrustedTypeFactory {
  createPolicy(
    name: string,
    rules: { createHTML(input: string): string; createScriptURL(input: string): string },
  ): Policy
}

export const TRUSTED_TYPES_POLICY = 'pecking-order'

let cached: Policy | null | undefined

function sameOriginUrl(input: string): string {
  const base = globalThis.location?.href
  const url = new URL(input, base)
  if (base && url.origin !== new URL(base).origin) {
    throw new TypeError(`Refusing a cross-origin script URL: ${url.origin}`)
  }
  return url.href
}

function policy(): Policy | null {
  if (cached !== undefined) return cached
  const factory = (globalThis as { trustedTypes?: TrustedTypeFactory }).trustedTypes
  try {
    cached =
      factory?.createPolicy(TRUSTED_TYPES_POLICY, {
        // Only parseInertHtml calls this, and only for DOMParser.
        createHTML: (input) => input,
        createScriptURL: sameOriginUrl,
      }) ?? null
  } catch {
    cached = null
  }
  return cached
}

/**
 * A detached document for reading text and attributes out of untrusted HTML.
 * DOMParser documents run no scripts and load no images. Never move nodes from
 * it into the live page.
 */
export function parseInertHtml(html: string): Document {
  const p = policy()
  const input = (p ? p.createHTML(html) : html) as string
  return new DOMParser().parseFromString(input, 'text/html')
}

/** A script URL for `new Worker()`, accepted only when it is same-origin. */
export function trustedScriptUrl(url: string): string {
  const p = policy()
  return (p ? p.createScriptURL(url) : sameOriginUrl(url)) as string
}
