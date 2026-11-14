import { afterEach, describe, expect, it, vi } from 'vitest'
import commonsFixture from './fixtures/commons.json'
import openverseFixture from './fixtures/openverse.json'
import wikipediaFixture from './fixtures/wikipedia.json'
import { htmlToText, wikimediaThumbAt } from './http'
import { SOURCES } from './index'
import { formatLicense, mapOpenverseResponse, openverse, openverseUrl } from './openverse'
import { commonsUrl, mapCommonsResponse, wikimedia } from './wikimedia'
import { mapWikipediaResponse, wikipedia, wikipediaUrl } from './wikipedia'

// Fixtures are real API responses (Nov 2026), trimmed to a few results.

afterEach(() => vi.unstubAllGlobals())

const stubJson = (body: unknown, status = 200) => {
  const spy = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  )
  vi.stubGlobal('fetch', spy)
  return spy
}

describe('SOURCES', () => {
  it('lists Wikipedia, Commons, then Openverse', () => {
    expect(SOURCES.map((s) => s.id)).toEqual(['wikipedia', 'wikimedia', 'openverse'])
  })
})

describe('wikipedia', () => {
  it('maps lead images in rank order, skipping pages without one', () => {
    const results = mapWikipediaResponse(wikipediaFixture)
    expect(results.map((r) => r.title)).toEqual(['Tom Hanks', 'Tom Hanway'])
    expect(results[0]).toMatchObject({
      id: '43568',
      provider: 'wikipedia',
      credit: {
        provider: 'wikipedia',
        sourceUrl: 'https://en.wikipedia.org/wiki/Tom_Hanks',
        license: 'See Wikipedia',
      },
    })
    expect(results[0]?.fetchUrl).toContain('/500px-')
    expect(results[0]?.thumbUrl).toContain('/250px-')
    // Small originals are served unscaled, and must not be rewritten.
    expect(results[1]?.thumbUrl).toBe(results[1]?.fetchUrl)
  })

  it('builds a prefix search with paging', () => {
    const url = wikipediaUrl('Tom Han', 2)
    expect(url.origin).toBe('https://en.wikipedia.org')
    expect(url.searchParams.get('generator')).toBe('prefixsearch')
    expect(url.searchParams.get('gpssearch')).toBe('Tom Han')
    expect(url.searchParams.get('gpsoffset')).toBe('20')
    expect(url.searchParams.get('pithumbsize')).toBe('500')
    expect(url.searchParams.get('origin')).toBe('*')
  })

  it('identifies itself with Api-User-Agent', async () => {
    const spy = stubJson(wikipediaFixture)
    await wikipedia.search('Tom Han')
    const headers = spy.mock.calls[0]?.[1]?.headers as Record<string, string>
    expect(headers['Api-User-Agent']).toMatch(/^PeckingOrder\//)
  })

  it('surfaces MediaWiki errors sent with HTTP 200', async () => {
    stubJson({ error: { code: 'badvalue', info: 'Unrecognized value' } })
    await expect(wikipedia.search('x')).rejects.toThrow(/Unrecognized value/)
  })
})

describe('wikimedia commons', () => {
  it('maps files with plain-text credit', () => {
    const results = mapCommonsResponse(commonsFixture)
    expect(results.map((r) => r.title)).toEqual(['Red Panda', 'Lesser panda standing'])
    expect(results[0]).toEqual({
      id: '39790',
      provider: 'wikimedia',
      title: 'Red Panda',
      thumbUrl: expect.stringContaining('/250px-Red_Panda.JPG'),
      fetchUrl: expect.stringContaining('/500px-Red_Panda.JPG'),
      credit: {
        provider: 'wikimedia',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Red_Panda.JPG',
        author: 'User Bernard Landgraf on de.wikipedia.org',
        license: 'CC BY-SA 3.0',
      },
    })
    expect(results[1]?.credit.author).toBe('DANIEL WONG from Newark, CA, USA')
  })

  it('drops Flickr photo ids from titles', () => {
    const page = {
      pageid: 2,
      title: 'File:Red Panda (24986761703).jpg',
      imageinfo: [{ mime: 'image/jpeg', thumburl: 'https://t.org/thumb/x/500px-x.jpg' }],
    }
    expect(mapCommonsResponse({ query: { pages: [page] } })[0]?.title).toBe('Red Panda')
  })

  it('skips files without a usable thumbnail', () => {
    const body = {
      query: {
        pages: [{ pageid: 1, title: 'File:Doc.pdf', imageinfo: [{ mime: 'application/pdf' }] }],
      },
    }
    expect(mapCommonsResponse(body)).toEqual([])
  })

  it('searches bitmaps only, at a standard thumbnail width', () => {
    const url = commonsUrl('red panda', 3)
    expect(url.searchParams.get('gsrsearch')).toBe('red panda filetype:bitmap')
    expect(url.searchParams.get('gsrnamespace')).toBe('6')
    expect(url.searchParams.get('gsroffset')).toBe('40')
    expect(url.searchParams.get('iiurlwidth')).toBe('500')
  })

  it('turns HTTP 429 into a friendly message', async () => {
    stubJson({}, 429)
    await expect(wikimedia.search('panda')).rejects.toThrow(/rate limited.*minute/)
  })
})

describe('openverse', () => {
  it('maps results to CORS-safe thumbs with licence credit', () => {
    const [first] = mapOpenverseResponse(openverseFixture)
    expect(first).toEqual({
      id: 'd50e8a0f-ed1d-40ac-b645-7453053dcabe',
      provider: 'openverse',
      title: 'panda',
      thumbUrl: 'https://api.openverse.org/v1/images/d50e8a0f-ed1d-40ac-b645-7453053dcabe/thumb/',
      fetchUrl: 'https://api.openverse.org/v1/images/d50e8a0f-ed1d-40ac-b645-7453053dcabe/thumb/',
      credit: {
        provider: 'openverse',
        sourceUrl: 'https://www.flickr.com/photos/91501748@N07/26251937355',
        author: 'Mathias Appel',
        license: 'CC0 1.0',
      },
    })
  })

  it('formats licence codes', () => {
    expect(formatLicense('by-nc-sa', '2.0')).toBe('CC BY-NC-SA 2.0')
    expect(formatLicense('pdm', '1.0')).toBe('Public Domain Mark 1.0')
    expect(formatLicense(null, null)).toBeUndefined()
  })

  it('stays within anonymous limits', () => {
    const url = openverseUrl('panda', 2)
    expect(url.searchParams.get('page_size')).toBe('20')
    expect(url.searchParams.get('page')).toBe('2')
    expect(url.searchParams.get('mature')).toBe('false')
  })

  it('treats 401 past the first page as the end of results', async () => {
    stubJson({ detail: 'Authentication required' }, 401)
    expect(await openverse.search('panda', { page: 13 })).toEqual([])
    await expect(openverse.search('panda')).rejects.toThrow(/HTTP 401/)
  })
})

describe('every source', () => {
  it.each(SOURCES)('$name skips the network for blank queries', async (source) => {
    const spy = stubJson({})
    expect(await source.search('   ')).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })

  it.each(SOURCES)('$name rejects with the abort reason when cancelled', async (source) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        init.signal?.throwIfAborted()
        return new Response('{}')
      }),
    )
    const controller = new AbortController()
    controller.abort()
    await expect(source.search('cats', { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
  })

  it.each(SOURCES)('$name explains network failures', async (source) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    await expect(source.search('cats')).rejects.toThrow(/Couldn't reach/)
  })
})

describe('helpers', () => {
  it('strips HTML to text without rendering it', () => {
    expect(
      htmlToText('<a href="x" onclick="evil()">Ann</a> &amp; <img src=x onerror=alert(1)>Bo'),
    ).toBe('Ann & Bo')
  })

  it('only rewrites real thumbnail paths', () => {
    expect(wikimediaThumbAt('https://t.org/thumb/a/ab/X.jpg/500px-X.jpg?u=1', 250)).toBe(
      'https://t.org/thumb/a/ab/X.jpg/250px-X.jpg?u=1',
    )
    expect(wikimediaThumbAt('https://u.org/a/ab/X.jpg', 250)).toBe('https://u.org/a/ab/X.jpg')
  })
})
