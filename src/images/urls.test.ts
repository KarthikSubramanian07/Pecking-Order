import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CORS_MESSAGE,
  decodeDataUrl,
  fetchImageBlob,
  isImageishUrl,
  isPublicHostname,
  MAX_REMOTE_BYTES,
  parseImageUrl,
} from './urls'

describe('parseImageUrl', () => {
  it('accepts http(s) and data:image URLs', () => {
    expect(parseImageUrl(' https://a.org/x.png ').href).toBe('https://a.org/x.png')
    expect(parseImageUrl('http://a.org/x').protocol).toBe('http:')
    expect(parseImageUrl('data:image/png;base64,AAAA').protocol).toBe('data:')
  })

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'file:///etc/passwd',
    'ftp://a.org/x.png',
    'blob:https://a.org/123',
    'data:text/html,<script>alert(1)</script>',
    'not a url',
  ])('rejects %s', (raw) => {
    expect(() => parseImageUrl(raw)).toThrow()
  })
})

describe('isImageishUrl', () => {
  it('recognises image links by extension', () => {
    expect(isImageishUrl('https://i.imgur.com/abc.JPG?x=1')).toBe(true)
    expect(isImageishUrl('data:image/gif;base64,R0lG')).toBe(true)
    expect(isImageishUrl('https://example.com/article')).toBe(false)
    expect(isImageishUrl('javascript:x.png')).toBe(false)
  })
})

describe('fetchImageBlob', () => {
  afterEach(() => vi.unstubAllGlobals())

  const respond = (body: BodyInit, headers: Record<string, string>, status = 200) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status, headers })),
    )

  it('fetches without credentials or referrer', async () => {
    respond('PNG', { 'content-type': 'image/png' })
    const blob = await fetchImageBlob(new URL('https://a.org/x.png'))
    expect(blob.type).toBe('image/png')
    expect(blob.size).toBe(3)
    expect(fetch).toHaveBeenCalledWith(
      'https://a.org/x.png',
      expect.objectContaining({ mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' }),
    )
  })

  it('rejects responses that are not images', async () => {
    respond('<html>', { 'content-type': 'text/html; charset=utf-8' })
    await expect(fetchImageBlob(new URL('https://a.org/page'))).rejects.toThrow(/doesn't point/)
  })

  it('rejects HTTP errors', async () => {
    respond('nope', { 'content-type': 'text/plain' }, 404)
    await expect(fetchImageBlob(new URL('https://a.org/x.png'))).rejects.toThrow(/HTTP 404/)
  })

  it('rejects images over the size cap', async () => {
    respond(new Uint8Array(MAX_REMOTE_BYTES + 1), { 'content-type': 'image/jpeg' })
    await expect(fetchImageBlob(new URL('https://a.org/x.jpg'))).rejects.toThrow(/15 MB/)
  })

  it('explains CORS and network failures in plain words', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    await expect(fetchImageBlob(new URL('https://a.org/x.png'))).rejects.toThrow(CORS_MESSAGE)
  })

  it('surfaces the caller abort rather than a friendly message', async () => {
    const controller = new AbortController()
    controller.abort()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        init.signal?.throwIfAborted()
        return new Response('x')
      }),
    )
    await expect(
      fetchImageBlob(new URL('https://a.org/x.png'), controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('isPublicHostname', () => {
  const host = (url: string) => new URL(url).hostname

  it.each([
    'http://localhost/',
    'http://LOCALHOST./',
    'http://app.localhost/',
    'http://127.0.0.1/',
    'http://127.1/',
    'http://2130706433/',
    'http://0x7f.0.0.1/',
    'http://0.0.0.0/',
    'http://10.1.2.3/',
    'http://100.64.0.1/',
    'http://169.254.169.254/',
    'http://172.16.0.1/',
    'http://172.31.255.255/',
    'http://192.168.0.10/',
    'http://198.18.0.1/',
    'http://224.0.0.1/',
    'http://255.255.255.255/',
    'http://[::]/',
    'http://[::1]/',
    'http://[fc00::1]/',
    'http://[fd12:3456::1]/',
    'http://[fe80::1]/',
    'http://[ff02::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:192.168.1.1]/',
    'http://[64:ff9b::a00:1]/',
    'http://nas/',
    'http://printer.local/',
    'http://db.internal/',
    'http://box.home.arpa/',
  ])('treats %s as private', (url) => {
    expect(isPublicHostname(host(url))).toBe(false)
  })

  it.each([
    'https://upload.wikimedia.org/',
    'https://8.8.8.8/',
    'https://172.32.0.1/',
    'https://100.128.0.1/',
    'https://[2606:4700::6810:84e5]/',
    'https://[::ffff:8.8.8.8]/',
    'https://xn--bcher-kva.example/',
  ])('treats %s as public', (url) => {
    expect(isPublicHostname(host(url))).toBe(true)
  })

  it('makes parseImageUrl refuse private hosts and embedded passwords', () => {
    expect(() => parseImageUrl('http://192.168.1.1/cam.jpg')).toThrow(/private network/)
    expect(() => parseImageUrl('https://user:pw@a.org/x.png')).toThrow(/password/)
  })
})

describe('decodeDataUrl', () => {
  it('decodes base64 and percent-encoded payloads', async () => {
    const b64 = decodeDataUrl(`data:image/png;base64,${btoa('\x89PNG')}`)
    expect(b64.type).toBe('image/png')
    expect([...new Uint8Array(await b64.arrayBuffer())]).toEqual([0x89, 0x50, 0x4e, 0x47])

    const svg = decodeDataUrl("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E")
    expect(svg.type).toBe('image/svg+xml')
    expect(await svg.text()).toBe("<svg xmlns='http://www.w3.org/2000/svg'/>")

    const binary = decodeDataUrl('data:image/gif,GIF%FF%00é')
    expect([...new Uint8Array(await binary.arrayBuffer())]).toEqual([
      0x47, 0x49, 0x46, 0xff, 0x00, 0xc3, 0xa9,
    ])
  })

  it('accepts whitespace and parameters in base64 data', async () => {
    const blob = decodeDataUrl(
      `data:image/jpeg;name=x.jpg;base64,${btoa('abc').split('').join(' ')}`,
    )
    expect(await blob.text()).toBe('abc')
  })

  it.each([
    'data:text/html,<script>alert(1)</script>',
    'data:,hello',
    'data:image/png;base64,***',
    'data:image/png;base64,',
  ])('rejects %s', (href) => {
    expect(() => decodeDataUrl(href)).toThrow()
  })

  it('refuses oversized payloads before decoding them', () => {
    const huge = `data:image/png;base64,${'A'.repeat(Math.ceil((MAX_REMOTE_BYTES * 4) / 3) + 8)}`
    expect(() => decodeDataUrl(huge)).toThrow(/15 MB/)
  })

  it('is what fetchImageBlob uses for data: URLs, so CSP connect-src never sees them', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    const blob = await fetchImageBlob(new URL(`data:image/webp;base64,${btoa('RIFF')}`))
    expect(blob.type).toBe('image/webp')
    expect(spy).not.toHaveBeenCalled()
  })
})
