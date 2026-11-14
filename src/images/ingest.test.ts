import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getImage } from '@/storage/db'
import { primeImageUrl } from './cache'
import { ingestDataTransfer, ingestFiles, ingestUrl, MAX_BATCH } from './ingest'
import { dirEntry, fakeDataTransfer, fileEntry, imageFile } from './test-utils'

// jsdom can't decode or encode pixels: stand in a processor whose "hash" is
// the file's text, so identical content means identical hash.
vi.mock('./process', () => ({
  processImage: async (blob: Blob) => {
    const text = await blob.text()
    if (text === 'corrupt') throw new Error("Couldn't read that image.")
    return { hash: `h-${text}`, blob, width: 10, height: 10, createdAt: 0 }
  },
}))
vi.mock('./cache', () => ({ primeImageUrl: vi.fn() }))

// The image store is content-addressed and writes are idempotent, so tests
// can share one fake-indexeddb database.
beforeEach(() => vi.mocked(primeImageUrl).mockClear())
afterEach(() => vi.unstubAllGlobals())

describe('ingestFiles', () => {
  it('stores, primes and labels each image', async () => {
    const { items, failed } = await ingestFiles([imageFile('pad_thai.png', 'pt')])
    expect(failed).toEqual([])
    expect(items).toEqual([{ label: 'pad thai', image: 'h-pt', credit: { provider: 'upload' } }])
    expect(await getImage('h-pt')).toMatchObject({ hash: 'h-pt' })
    expect(primeImageUrl).toHaveBeenCalledWith('h-pt', expect.any(Blob))
  })

  it('collapses identical images within a batch, keeping the first', async () => {
    const { items } = await ingestFiles([
      imageFile('first.png', 'same'),
      imageFile('other.png', 'different'),
      imageFile('copy of first.png', 'same'),
    ])
    expect(items.map((i) => i.label)).toEqual(['first', 'other'])
  })

  it('skips non-images and hidden files, and reports broken images', async () => {
    const { items, failed } = await ingestFiles([
      new File(['x'], 'notes.txt', { type: 'text/plain' }),
      imageFile('.hidden.png'),
      imageFile('broken.jpg', 'corrupt'),
      new File(['heic'], 'IMG_0001.HEIC'), // no MIME type: trusted by extension
    ])
    expect(items.map((i) => i.label)).toEqual(['IMG 0001'])
    expect(failed).toEqual([{ name: 'broken.jpg', reason: "Couldn't read that image." }])
  })

  it(`caps a batch at ${MAX_BATCH} images and reports progress`, async () => {
    const files = Array.from({ length: MAX_BATCH + 2 }, (_, i) => imageFile(`${i}.png`))
    const progress: [number, number][] = []
    const { items, failed } = await ingestFiles(files, {
      onProgress: (done, total) => progress.push([done, total]),
    })
    expect(items).toHaveLength(MAX_BATCH)
    expect(failed.map((f) => f.name)).toEqual([`${MAX_BATCH}.png`, `${MAX_BATCH + 1}.png`])
    expect(failed[0]?.reason).toMatch(/500/)
    expect(progress[0]).toEqual([0, MAX_BATCH])
    expect(progress.at(-1)).toEqual([MAX_BATCH, MAX_BATCH])
  })

  it('rejects with the abort reason when cancelled', async () => {
    const controller = new AbortController()
    const run = ingestFiles([imageFile('a.png'), imageFile('b.png')], {
      signal: controller.signal,
      onProgress: (done) => done === 1 && controller.abort(),
    })
    await expect(run).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('ingestDataTransfer', () => {
  it('reads dropped files and folders', async () => {
    const folder = dirEntry(
      'Album',
      [
        fileEntry(imageFile('one.png')),
        fileEntry(imageFile('.DS_Store')),
        dirEntry('Nested', [fileEntry(imageFile('two.png'))]),
        fileEntry(imageFile('three.png')),
      ],
      2,
    )
    const dt = fakeDataTransfer({
      files: [imageFile('loose.png')],
      entries: [folder],
      data: { 'text/plain': 'ignored when files are present' },
    })
    const { items } = await ingestDataTransfer(dt)
    expect(items.map((i) => i.label)).toEqual(['loose', 'one', 'two', 'three'])
  })

  it('turns plain text lines into text-only items', async () => {
    const dt = fakeDataTransfer({ data: { 'text/plain': 'Pizza\nTacos\n' } })
    const { items } = await ingestDataTransfer(dt)
    expect(items).toEqual([{ label: 'Pizza' }, { label: 'Tacos' }])
  })

  it('fetches <img> sources from dropped HTML, labelled by alt text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('ramen', { headers: { 'content-type': 'image/jpeg' } })),
    )
    const dt = fakeDataTransfer({
      data: { 'text/html': '<img src="https://a.org/r.jpg" alt="Ramen">' },
    })
    const { items } = await ingestDataTransfer(dt)
    expect(items).toEqual([
      {
        label: 'Ramen',
        image: 'h-ramen',
        credit: { provider: 'url', sourceUrl: 'https://a.org/r.jpg' },
      },
    ])
  })

  it('reports URLs that fail without failing the whole drop', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('ok.png')
          ? new Response('ok', { headers: { 'content-type': 'image/png' } })
          : new Response('<html>', { headers: { 'content-type': 'text/html' } }),
      ),
    )
    const dt = fakeDataTransfer({
      data: { 'text/uri-list': 'https://a.org/ok.png\nhttps://a.org/page' },
    })
    const { items, failed } = await ingestDataTransfer(dt)
    expect(items.map((i) => i.image)).toEqual(['h-ok'])
    expect(failed).toEqual([{ name: 'https://a.org/page', reason: expect.stringMatching(/image/) }])
  })
})

describe('ingestUrl', () => {
  it('stores the image with a link-back credit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('cat', { headers: { 'content-type': 'image/webp' } })),
    )
    const item = await ingestUrl('https://a.org/Grumpy_Cat.webp')
    expect(item).toEqual({
      label: 'Grumpy Cat',
      image: 'h-cat',
      credit: { provider: 'url', sourceUrl: 'https://a.org/Grumpy_Cat.webp' },
    })
  })

  it('keeps a caller-supplied credit and label', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('fox', { headers: { 'content-type': 'image/jpeg' } })),
    )
    const credit = { provider: 'wikimedia' as const, license: 'CC BY-SA 4.0' }
    expect(await ingestUrl('https://a.org/f.jpg', credit, 'Red fox')).toEqual({
      label: 'Red fox',
      image: 'h-fox',
      credit,
    })
  })

  it('refuses dangerous URLs before fetching', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    await expect(ingestUrl('javascript:alert(1)')).rejects.toThrow(/http/)
    await expect(ingestUrl('file:///etc/hosts')).rejects.toThrow(/http/)
    expect(spy).not.toHaveBeenCalled()
  })
})
