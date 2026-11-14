import { afterEach, describe, expect, it, vi } from 'vitest'
import { htmlToText, resolvePackImage, upscaleThumb, WIKIMEDIA_HEADERS } from './resolve'

const THUMB =
  'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/83/Hen.jpg/330px-Hen.jpg?utm_source=en.wikipedia.org'

function mockFetch(body: unknown, status = 200) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => Response.json(body, { status }))
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('upscaleThumb', () => {
  it('swaps in the 500px step when the original is large enough', () => {
    expect(upscaleThumb(THUMB, 1600)).toBe(
      'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/83/Hen.jpg/500px-Hen.jpg?utm_source=en.wikipedia.org',
    )
  })

  it('always upscales SVG renders, which have no fixed size', () => {
    const svg =
      'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9a/Logo.svg/330px-Logo.svg.png'
    expect(upscaleThumb(svg, 64)).toBe(
      'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9a/Logo.svg/500px-Logo.svg.png',
    )
  })

  it('leaves small originals and non-thumbnail URLs alone', () => {
    expect(upscaleThumb(THUMB, 420)).toBe(THUMB)
    expect(upscaleThumb(THUMB, undefined)).toBe(THUMB)
    const unscaled = 'https://upload.wikimedia.org/wikipedia/en/1/13/Toy_Story.jpg'
    expect(upscaleThumb(unscaled, 250)).toBe(unscaled)
  })
})

describe('resolvePackImage', () => {
  it('returns null for text-only items without touching the network', async () => {
    const fetch = mockFetch({})
    expect(await resolvePackImage({ id: 'x', label: 'X' })).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('uses direct images as-is', async () => {
    const url = 'https://static.tvmaze.com/a.jpg'
    expect(await resolvePackImage({ id: 'x', label: 'X', image: url })).toEqual({
      url,
      credit: { provider: 'pack', sourceUrl: url },
    })
  })

  it('resolves a Wikipedia lead image with attribution', async () => {
    const fetch = mockFetch({
      type: 'standard',
      thumbnail: { source: THUMB, width: 330, height: 300 },
      originalimage: { source: 'https://upload.wikimedia.org/x/Hen.jpg', width: 1652 },
      content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Rhode_Island_Red' } },
    })
    const signal = new AbortController().signal
    const result = await resolvePackImage(
      { id: 'rir', label: 'RIR', wikipedia: 'Rhode Island Red' },
      signal,
    )
    expect(result).toEqual({
      url: THUMB.replace('330px', '500px'),
      credit: {
        provider: 'wikipedia',
        sourceUrl: 'https://en.wikipedia.org/wiki/Rhode_Island_Red',
        license: 'See Wikipedia',
      },
    })
    expect(fetch).toHaveBeenCalledWith(
      'https://en.wikipedia.org/api/rest_v1/page/summary/Rhode_Island_Red',
      // No cookies and no referrer: Wikimedia learns nothing about the page.
      { headers: WIKIMEDIA_HEADERS, credentials: 'omit', referrerPolicy: 'no-referrer', signal },
    )
  })

  it('encodes titles containing slashes and punctuation', async () => {
    const fetch = mockFetch({ type: 'standard' })
    await resolvePackImage({ id: 'acdc', label: 'AC/DC', wikipedia: 'AC/DC' })
    expect(fetch.mock.calls[0]?.[0]).toBe(
      'https://en.wikipedia.org/api/rest_v1/page/summary/AC%2FDC',
    )
  })

  it('returns null when the article has no lead image', async () => {
    mockFetch({ type: 'standard', title: 'Havarti' })
    expect(await resolvePackImage({ id: 'h', label: 'H', wikipedia: 'Havarti' })).toBeNull()
  })

  it('throws for missing articles and disambiguation pages', async () => {
    mockFetch({ title: 'Not found.' }, 404)
    await expect(resolvePackImage({ id: 'n', label: 'N', wikipedia: 'Nope' })).rejects.toThrow(
      'Wikipedia article "Nope" not found',
    )
    mockFetch({ type: 'disambiguation' })
    await expect(resolvePackImage({ id: 'm', label: 'M', wikipedia: 'Mercury' })).rejects.toThrow(
      /disambiguation/,
    )
    mockFetch({}, 503)
    await expect(resolvePackImage({ id: 'm', label: 'M', wikipedia: 'Mars' })).rejects.toThrow(
      /HTTP 503/,
    )
  })

  it('resolves a Commons file with author and licence as plain text', async () => {
    const fetch = mockFetch({
      query: {
        pages: [
          {
            title: 'File:Pizza.jpg',
            imageinfo: [
              {
                thumburl: 'https://thumb.wikimedia.org/a/a4/Pizza.jpg/500px-Pizza.jpg',
                url: 'https://upload.wikimedia.org/a/a4/Pizza.jpg',
                descriptionurl: 'https://commons.wikimedia.org/wiki/File:Pizza.jpg',
                extmetadata: {
                  Artist: {
                    value:
                      'Jakob <a href="https://x" onclick="alert(1)">Dettner</a><script>bad()</script>',
                  },
                  LicenseShortName: { value: 'CC BY-SA 2.0 de' },
                },
              },
            ],
          },
        ],
      },
    })
    const result = await resolvePackImage({ id: 'p', label: 'P', commons: 'File:Pizza.jpg' })
    expect(result).toEqual({
      url: 'https://thumb.wikimedia.org/a/a4/Pizza.jpg/500px-Pizza.jpg',
      credit: {
        provider: 'wikimedia',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Pizza.jpg',
        author: 'Jakob Dettner',
        license: 'CC BY-SA 2.0 de',
      },
    })
    const url = new URL(fetch.mock.calls[0]?.[0] as string)
    expect(url.origin + url.pathname).toBe('https://commons.wikimedia.org/w/api.php')
    expect(url.searchParams.get('titles')).toBe('File:Pizza.jpg')
    expect(url.searchParams.get('iiurlwidth')).toBe('500')
    expect(url.searchParams.get('origin')).toBe('*')
  })

  it('throws for missing Commons files', async () => {
    mockFetch({ query: { pages: [{ title: 'File:Nope.jpg', missing: true }] } })
    await expect(
      resolvePackImage({ id: 'n', label: 'N', commons: 'File:Nope.jpg' }),
    ).rejects.toThrow('Commons file "File:Nope.jpg" not found')
  })

  it('propagates aborts', async () => {
    const controller = new AbortController()
    controller.abort()
    vi.stubGlobal('fetch', (_url: string, init?: RequestInit) => {
      init?.signal?.throwIfAborted()
      return Promise.resolve(Response.json({}))
    })
    await expect(
      resolvePackImage({ id: 'a', label: 'A', wikipedia: 'Apple' }, controller.signal),
    ).rejects.toThrow()
  })
})

describe('htmlToText', () => {
  it('keeps only text and collapses whitespace', () => {
    expect(htmlToText('<b>Jane</b>\n  <i>Doe</i>')).toBe('Jane Doe')
    expect(htmlToText('<img src=x onerror="alert(1)">')).toBeUndefined()
  })
})
