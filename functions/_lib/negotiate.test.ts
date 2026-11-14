// @vitest-environment node
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  MARKDOWN_TWINS,
  notFoundMarkdown,
  pagePath,
  prefersMarkdown,
  route,
  varyOnAccept,
} from './negotiate'

const CHROME =
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'

describe('prefersMarkdown', () => {
  it.each([
    ['text/markdown', true],
    ['text/markdown, text/html', true],
    ['text/markdown;q=1, text/html;q=0.5', true],
    ['TEXT/MARKDOWN; charset=utf-8', true],
    ['text/html, text/markdown', false],
    ['text/markdown;q=0.9, text/html', false],
    ['text/html;q=0.5, text/markdown;q=0.9', true],
    ['text/markdown, */*;q=0.8', true],
    ['text/plain, text/markdown;q=0.5, */*', false],
    ['text/markdown;q=0', false],
    ['text/markdown;q=nonsense', false],
    ['*/*', false],
    ['text/*', false],
    [CHROME, false],
    ['', false],
    [null, false],
    [undefined, false],
  ])('%s → %s', (accept, expected) => {
    expect(prefersMarkdown(accept)).toBe(expected)
  })

  it('treats text/* as an HTML match when ranking', () => {
    expect(prefersMarkdown('text/*, text/markdown;q=0.9')).toBe(false)
    expect(prefersMarkdown('text/markdown, text/*')).toBe(true)
  })
})

describe('pagePath', () => {
  it.each([
    ['/', '/'],
    ['/about', '/about/'],
    ['/about/', '/about/'],
    ['/about/index.html', '/about/'],
    ['/index.html', '/'],
    ['//about//', '/about/'],
  ])('%s → %s', (input, expected) => {
    expect(pagePath(input)).toBe(expected)
  })
})

describe('route', () => {
  it('passes through anything that is not a markdown request', () => {
    expect(route('/', CHROME)).toEqual({ kind: 'pass' })
    expect(route('/nope', null)).toEqual({ kind: 'pass' })
  })

  it('maps every page to its markdown twin', () => {
    expect(route('/', 'text/markdown')).toEqual({ kind: 'markdown', asset: '/index.md' })
    expect(route('/about', 'text/markdown')).toEqual({ kind: 'markdown', asset: '/about.md' })
    expect(route('/privacy/', 'text/markdown')).toEqual({ kind: 'markdown', asset: '/privacy.md' })
    expect(route('/contact/index.html', 'text/markdown')).toEqual({
      kind: 'markdown',
      asset: '/contact.md',
    })
  })

  it('reports unknown pages as markdown 404s', () => {
    expect(route('/nope', 'text/markdown')).toEqual({ kind: 'markdown-not-found' })
    expect(route('/about/team/', 'text/markdown')).toEqual({ kind: 'markdown-not-found' })
  })

  it('never negotiates file paths', () => {
    for (const path of ['/index.md', '/llms.txt', '/og.png', '/assets/index-abc.js', '/x.html']) {
      expect(route(path, 'text/markdown')).toEqual({ kind: 'pass' })
    }
  })

  it('points at markdown files that exist in public/', () => {
    for (const asset of Object.values(MARKDOWN_TWINS)) {
      expect(existsSync(new URL(`../../public${asset}`, import.meta.url))).toBe(true)
    }
  })
})

describe('notFoundMarkdown', () => {
  it('links the sitemap and llms.txt on the same origin', () => {
    const body = notFoundMarkdown('/nope', 'https://example.test')
    expect(body).toMatch(/^# Not found/)
    expect(body).toContain('`/nope`')
    expect(body).toContain('(https://example.test/sitemap.xml)')
    expect(body).toContain('(https://example.test/llms.txt)')
  })

  it('cannot break out of the inline code span', () => {
    expect(notFoundMarkdown('/a`b', 'https://example.test')).toContain('`/ab`')
  })
})

describe('varyOnAccept', () => {
  it.each([
    [null, 'Accept'],
    ['', 'Accept'],
    ['Accept-Encoding', 'Accept-Encoding, Accept'],
    ['accept', 'accept'],
    ['Origin, Accept', 'Origin, Accept'],
    ['*', '*'],
  ])('%s → %s', (existing, expected) => {
    expect(varyOnAccept(existing)).toBe(expected)
  })
})
