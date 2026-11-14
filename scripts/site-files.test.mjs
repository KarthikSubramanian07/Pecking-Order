// @vitest-environment node
// Integrity checks for the hand-written static site files in public/ and index.html.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_ORIGIN, ORIGIN_FILE_PATTERN, resolveOrigin } from '../site.config.ts'

const root = new URL('../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')
const exists = (path) => existsSync(new URL(path, root))

/** Site path → file in the repo (`/` is the Vite entry, the rest live in public/). */
function fileFor(path) {
  if (path === '/') return 'index.html'
  return `public${path.endsWith('/') ? `${path}index.html` : path}`
}

const PAGES = ['/', '/about/', '/privacy/', '/contact/']
const textFiles = [
  'index.html',
  ...readdirSync(new URL('public/', root), { recursive: true })
    .filter((f) => ORIGIN_FILE_PATTERN.test(f))
    .map((f) => `public/${f}`),
]

describe('resolveOrigin', () => {
  it('defaults to the canonical origin', () => {
    expect(resolveOrigin(undefined)).toBe(DEFAULT_ORIGIN)
    expect(resolveOrigin('  ')).toBe(DEFAULT_ORIGIN)
  })

  it('accepts a bare https origin and trims a trailing slash', () => {
    expect(resolveOrigin('https://rank.example/')).toBe('https://rank.example')
  })

  it('rejects anything that is not a bare https origin', () => {
    for (const bad of ['http://rank.example', 'https://rank.example/path', 'rank.example']) {
      expect(() => resolveOrigin(bad)).toThrow(/SITE_ORIGIN/)
    }
  })
})

describe('absolute URLs', () => {
  it.each(textFiles)('%s only links to this site through the canonical origin', (file) => {
    const ownSite = read(file).match(/https:\/\/[a-z0-9.-]*pages\.dev[^\s"'<)]*/g) ?? []
    for (const url of ownSite) expect(url.startsWith(DEFAULT_ORIGIN)).toBe(true)
  })

  it.each(textFiles)('%s links only to pages and files that exist', (file) => {
    const urls = read(file).match(new RegExp(`${DEFAULT_ORIGIN}[^\\s"'<)]*`, 'g')) ?? []
    for (const url of urls) {
      const path = url.slice(DEFAULT_ORIGIN.length).split('#')[0] || '/'
      expect(exists(fileFor(path)), `${url} in ${file}`).toBe(true)
    }
  })
})

describe('pages', () => {
  it.each(PAGES)('%s has a canonical URL, a markdown twin and one H1', (path) => {
    const html = read(fileFor(path))
    expect(html).toContain(`<link rel="canonical" href="${DEFAULT_ORIGIN}${path}" />`)
    const twin = html.match(/<link rel="alternate" type="text\/markdown" href="([^"]+)"/)?.[1]
    expect(twin && exists(`public${twin}`)).toBe(true)
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
  })

  it('lists every page in the sitemap', () => {
    const locs = [...read('public/sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
    expect(locs).toEqual(PAGES.map((path) => `${DEFAULT_ORIGIN}${path}`))
  })

  it('keeps the homepage FAQ and its JSON-LD in step', () => {
    const html = read('index.html')
    const json = JSON.parse(
      html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1],
    )
    const faq = json['@graph'].find((node) => node['@type'] === 'FAQPage')
    const answers = faq.mainEntity.map((q) => q.acceptedAnswer.text)
    const visible = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    for (const answer of answers) expect(visible).toContain(answer)
  })
})

describe('Cloudflare Pages config', () => {
  const headers = read('public/_headers')

  it('stays within the _headers limits', () => {
    const rules = headers.split('\n').filter((line) => /^\S/.test(line) && !line.startsWith('#'))
    expect(rules.length).toBeLessThanOrEqual(100)
    for (const line of headers.split('\n')) expect(line.length).toBeLessThan(2000)
  })

  it('sends a strict CSP and the security headers on every route', () => {
    const csp = headers.match(/Content-Security-Policy: (.+)/)?.[1] ?? ''
    for (const directive of [
      "default-src 'self'",
      "script-src 'self';",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      'upgrade-insecure-requests',
    ]) {
      expect(csp).toContain(directive)
    }
    expect(csp).not.toMatch(/script-src[^;]*unsafe/)
    for (const header of [
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy: strict-origin-when-cross-origin',
      'Cross-Origin-Opener-Policy: same-origin',
      'Strict-Transport-Security: max-age=31536000',
    ]) {
      expect(headers).toContain(header)
    }
    const permissions = headers.match(/Permissions-Policy: (.+)/)?.[1] ?? ''
    for (const feature of ['camera', 'microphone', 'geolocation', 'payment', 'usb']) {
      expect(permissions).toContain(`${feature}=()`)
    }
  })

  it('caches hashed assets forever', () => {
    expect(headers).toMatch(/\/assets\/\*\n {2}Cache-Control: public, max-age=31536000, immutable/)
  })

  it('has a valid _routes.json', () => {
    const routes = JSON.parse(read('public/_routes.json'))
    expect(routes.version).toBe(1)
    expect(routes.include.length).toBeGreaterThan(0)
    const rules = [...routes.include, ...routes.exclude]
    expect(rules.length).toBeLessThanOrEqual(100)
    for (const rule of rules) expect(rule.length).toBeLessThanOrEqual(100)
  })

  it('references manifest icons that exist', () => {
    const manifest = JSON.parse(read('public/manifest.webmanifest'))
    for (const icon of manifest.icons) expect(exists(`public${icon.src}`), icon.src).toBe(true)
  })
})
