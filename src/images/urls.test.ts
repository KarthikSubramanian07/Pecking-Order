import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CORS_MESSAGE,
  fetchImageBlob,
  isImageishUrl,
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
