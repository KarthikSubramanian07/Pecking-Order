import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assertValidBoard } from '@/core/board'
import { COOP, type ImageCredit } from '@/core/types'
import { ingestUrl } from '@/images/ingest'
import { boardFromPack, type InstallProgress, listPacks } from './install'

vi.mock('@/images/ingest', () => ({ ingestUrl: vi.fn() }))
const ingest = vi.mocked(ingestUrl)

const HASH = 'a'.repeat(64)
const THUMB = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/330px-X.jpg'

const pack = {
  id: 'test-pack',
  version: '2.1.0',
  title: 'Test Pack',
  description: 'For tests.',
  category: 'Miscellaneous',
  author: 'Pecking Order',
  items: [
    { id: 'wiki', label: 'From Wikipedia', wikipedia: 'Rhode Island Red' },
    { id: 'text', label: 'Just text' },
    { id: 'broken', label: 'Broken article', wikipedia: 'Nope' },
    { id: 'direct', label: 'Direct image', image: 'https://static.tvmaze.com/d.jpg' },
  ],
}

function routeFetch(packBody: unknown = pack, packStatus = 200) {
  const fn = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url === '/packs/test-pack.json') return Response.json(packBody, { status: packStatus })
    if (url.endsWith('/Rhode_Island_Red')) {
      return Response.json({
        type: 'standard',
        thumbnail: { source: THUMB },
        originalimage: { source: 'https://upload.wikimedia.org/X.jpg', width: 2000 },
        content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Rhode_Island_Red' } },
      })
    }
    return Response.json({}, { status: 404 })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => {
  ingest.mockReset()
  ingest.mockImplementation(async (url: string, credit?: ImageCredit, label?: string) => ({
    label: label ?? url,
    image: HASH,
    ...(credit ? { credit } : {}),
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('listPacks', () => {
  it('returns the generated catalog', async () => {
    const packs = await listPacks()
    expect(packs.length).toBeGreaterThan(0)
    expect(packs.map((p) => p.id)).toContain('chicken-breeds')
    for (const p of packs) expect(p.itemCount).toBeGreaterThanOrEqual(3)
  })
})

describe('boardFromPack', () => {
  it('builds a board with every item in the coop, in pack order', async () => {
    routeFetch()
    const board = await boardFromPack('test-pack')

    assertValidBoard(board)
    expect(board.title).toBe('Test Pack')
    expect(board.pack).toEqual({ id: 'test-pack', version: '2.1.0' })
    expect(board.tiers.map((t) => t.label)).toEqual(['S', 'A', 'B', 'C', 'D', 'F'])
    for (const t of board.tiers) expect(board.placement[t.id]).toEqual([])

    const coop = (board.placement[COOP] ?? []).map((id) => board.items[id])
    expect(coop.map((i) => i?.packItemId)).toEqual(['wiki', 'text', 'broken', 'direct'])
    expect(coop.map((i) => i?.label)).toEqual([
      'From Wikipedia',
      'Just text',
      'Broken article',
      'Direct image',
    ])
  })

  it('stores images with credits and falls back to text tiles on failure', async () => {
    routeFetch()
    const board = await boardFromPack('test-pack')
    const byPackId = Object.fromEntries(Object.values(board.items).map((i) => [i.packItemId, i]))

    expect(byPackId.wiki).toMatchObject({
      image: HASH,
      credit: {
        provider: 'wikipedia',
        sourceUrl: 'https://en.wikipedia.org/wiki/Rhode_Island_Red',
      },
    })
    expect(byPackId.direct).toMatchObject({ image: HASH, credit: { provider: 'pack' } })
    expect(byPackId.text?.image).toBeUndefined()
    expect(byPackId.broken?.image).toBeUndefined()

    expect(ingest).toHaveBeenCalledTimes(2)
    expect(ingest).toHaveBeenCalledWith(
      THUMB.replace('330px', '500px'),
      expect.objectContaining({ provider: 'wikipedia' }),
      'From Wikipedia',
    )
  })

  it('turns ingest failures into text tiles instead of failing the pack', async () => {
    routeFetch()
    ingest.mockRejectedValue(new Error('decode failed'))
    const board = await boardFromPack('test-pack')
    expect(Object.values(board.items)).toHaveLength(4)
    expect(Object.values(board.items).every((i) => i.image === undefined)).toBe(true)
  })

  it('uses the pack’s custom tiers', async () => {
    routeFetch({ ...pack, tiers: ['Life-changing', 'Fine', 'Why'] })
    const board = await boardFromPack('test-pack')
    expect(board.tiers.map((t) => t.label)).toEqual(['Life-changing', 'Fine', 'Why'])
  })

  it('reports progress for every item', async () => {
    routeFetch()
    const events: InstallProgress[] = []
    await boardFromPack('test-pack', { onProgress: (p) => events.push(p) })
    expect(events[0]).toEqual({ done: 0, total: 4 })
    expect(events.at(-1)).toEqual({ done: 4, total: 4 })
    expect(events).toHaveLength(5)
  })

  it('rejects unknown or invalid packs', async () => {
    routeFetch({}, 404)
    await expect(boardFromPack('test-pack')).rejects.toThrow('HTTP 404')
    routeFetch({ id: 'test-pack', title: 'Empty', items: [] })
    await expect(boardFromPack('test-pack')).rejects.toThrow('no items')
    await expect(boardFromPack('../../etc/passwd')).rejects.toThrow('Unknown pack')
  })

  it('stops when aborted instead of producing text tiles', async () => {
    const controller = new AbortController()
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url === '/packs/test-pack.json') return Response.json(pack)
      controller.abort()
      init?.signal?.throwIfAborted()
      return Response.json({})
    })
    await expect(boardFromPack('test-pack', { signal: controller.signal })).rejects.toThrow()
  })
})
