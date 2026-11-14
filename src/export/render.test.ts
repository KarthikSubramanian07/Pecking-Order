import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeBoard, options } from '@/test/exportFixtures'
import { renderBoardImage } from './render'

interface Call {
  name: string
  args: unknown[]
}

/** A recording stand-in for CanvasRenderingContext2D (jsdom has no canvas). */
function fakeContext(calls: Call[]) {
  const state: Record<string, unknown> = { letterSpacing: '0px' }
  const special: Record<string, (...a: never[]) => unknown> = {
    measureText: (text: string) => ({ width: text.length * 8 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({ setTransform() {} }),
  }
  return new Proxy(state, {
    get(target, prop: string) {
      if (prop in target) return target[prop]
      return (...args: never[]) => {
        calls.push({ name: prop, args })
        return special[prop]?.(...args)
      }
    },
    set(target, prop: string, value) {
      target[prop] = value
      return true
    },
  })
}

const fakeBitmap = (width: number, height: number) =>
  ({ width, height, close: vi.fn() }) as unknown as ImageBitmap

let calls: Call[]
let canvases: HTMLCanvasElement[]

beforeEach(() => {
  calls = []
  canvases = []
  vi.stubGlobal(
    'Path2D',
    class {
      constructor(readonly d: string) {}
    },
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    canvases.push(this)
    return fakeContext(calls) as unknown as CanvasRenderingContext2D
  } as never)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb: BlobCallback) =>
    cb(new Blob(['png'], { type: 'image/png' })),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const texts = () => calls.filter((c) => c.name === 'fillText').map((c) => c.args[0])

describe('renderBoardImage', () => {
  it('draws the board and returns a PNG at the scaled size', async () => {
    const board = makeBoard({ title: 'Snacks, ranked', tiers: [2, 0, 1], textEvery: 3 })
    const loadImage = vi.fn(async () => fakeBitmap(400, 300))
    const blob = await renderBoardImage(board, options({ format: 'wide', scale: 2 }), {
      loadImage,
    })

    expect(blob.type).toBe('image/png')
    const output = canvases.find((c) => c.width > 1)!
    expect(output.width).toBe(2400)
    expect(output.height).toBeGreaterThanOrEqual(1350)
    expect(texts()).toEqual(
      expect.arrayContaining(['Snacks, ranked', 'S', 'A', 'B', 'pecking-order.pages.dev']),
    )
    // Item 0 is text-only (textEvery: 3); the other two are drawn as images.
    expect(loadImage).toHaveBeenCalledTimes(2)
    const draws = calls.filter((c) => c.name === 'drawImage')
    expect(draws).toHaveLength(2)
    // Centre-crop: a 400×300 source is cropped to its middle 300×300 square.
    expect(draws[0]!.args.slice(1, 5)).toEqual([50, 0, 300, 300])
  })

  it('falls back to a text tile when an image cannot be decoded, and closes bitmaps', async () => {
    const board = makeBoard({ tiers: [2] })
    const ok = fakeBitmap(100, 100)
    const loadImage = vi.fn(async (hash: string) => {
      if (hash === 'hash-1') throw new Error('corrupt')
      return ok
    })
    await renderBoardImage(board, options({ showLabels: false }), { loadImage })
    expect(calls.filter((c) => c.name === 'drawImage')).toHaveLength(1)
    expect(texts()).toContain('Item 0.1')
    expect(ok.close).toHaveBeenCalled()
  })

  it('draws the hen watermark with Path2D strokes', async () => {
    await renderBoardImage(makeBoard({ tiers: [1] }), options(), {
      loadImage: async () => undefined,
    })
    expect(calls.filter((c) => c.name === 'stroke').length).toBeGreaterThan(5)
  })
})
