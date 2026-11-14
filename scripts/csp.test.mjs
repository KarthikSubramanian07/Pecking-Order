// @vitest-environment node
// The CSP in public/_headers and the build step that fills in its style hashes.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  applyStyleHashes,
  executableInlineScripts,
  inlineStyleHashes,
  STYLE_HASHES_PLACEHOLDER,
} from '../csp.config.ts'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const headers = read('public/_headers')
const csp = /^\s+Content-Security-Policy:\s*(.+)$/m.exec(headers)?.[1] ?? ''
const directives = Object.fromEntries(
  csp.split(';').map((d) => {
    const [name = '', ...values] = d.trim().split(/\s+/)
    return [name, values]
  }),
)

describe('public/_headers CSP', () => {
  it('has no unsafe sources and locks down plugins, framing and base URLs', () => {
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|unsafe-hashes|\*(?!\.)/)
    expect(directives['script-src']).toEqual(["'self'"])
    expect(directives['object-src']).toEqual(["'none'"])
    expect(directives['base-uri']).toEqual(["'none'"])
    expect(directives['frame-ancestors']).toEqual(["'none'"])
    expect(directives['worker-src']).toEqual(["'self'"])
  })

  it('requires Trusted Types through the one policy the app creates', () => {
    expect(directives['require-trusted-types-for']).toEqual(["'script'"])
    expect(directives['trusted-types']).toEqual(['pecking-order'])
    expect(read('src/security/trustedTypes.ts')).toContain("TRUSTED_TYPES_POLICY = 'pecking-order'")
  })

  it('allows inline styles only by hash, filled in at build time', () => {
    expect(directives['style-src']).toEqual(["'self'", STYLE_HASHES_PLACEHOLDER])
  })

  it('keeps data: and blob: out of connect-src (pasted images are decoded in JS)', () => {
    expect(directives['connect-src']).not.toContain('data:')
    expect(directives['connect-src']).not.toContain('blob:')
    for (const source of directives['connect-src'].slice(1)) expect(source).toMatch(/^https:\/\//)
  })
})

describe('csp.config helpers', () => {
  const sha = (text) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`

  it('hashes every inline style block exactly as written', () => {
    const html = '<style>a{b:c}</style><p></p><style media="print">\n x{}\n</style>'
    expect(inlineStyleHashes(html)).toEqual([sha('a{b:c}'), sha('\n x{}\n')])
  })

  it('fills the placeholder with the page hashes plus only the empty-stylesheet hash', () => {
    const line = `style-src 'self' ${STYLE_HASHES_PLACEHOLDER}; img-src 'self'`
    expect(applyStyleHashes(line, '<style>a{}</style>')).toBe(
      `style-src 'self' ${sha('a{}')} ${sha('')}; img-src 'self'`,
    )
    expect(applyStyleHashes(line, '<p>no styles</p>')).toBe(
      `style-src 'self' ${sha('')}; img-src 'self'`,
    )
    expect(() => applyStyleHashes("style-src 'self'", '')).toThrow(/placeholder/)
  })

  it('flags inline scripts a browser would run, but not JSON-LD or external scripts', () => {
    const html = [
      '<script type="application/ld+json">{"@type":"Thing"}</script>',
      '<script type="module" src="/assets/index.js"></script>',
      '<script>alert(1)</script>',
      '<script type="module">import "x"</script>',
    ].join('')
    expect(executableInlineScripts(html)).toEqual(['alert(1)', 'import "x"'])
    expect(executableInlineScripts(read('index.html'))).toEqual([])
  })
})
