import { describe, expect, it } from 'vitest'
import { downscaleSteps, fitWithin, hasAlpha, MAX_SIDE, sha256Hex } from './pipeline'

describe('fitWithin', () => {
  it('scales the longest side down to the limit, keeping aspect', () => {
    expect(fitWithin({ width: 4000, height: 3000 })).toEqual({ width: MAX_SIDE, height: 360 })
    expect(fitWithin({ width: 1000, height: 2000 })).toEqual({ width: 240, height: MAX_SIDE })
  })

  it('never upscales', () => {
    expect(fitWithin({ width: 120, height: 80 })).toEqual({ width: 120, height: 80 })
  })

  it('never collapses a sliver to zero pixels', () => {
    expect(fitWithin({ width: 10_000, height: 2 })).toEqual({ width: MAX_SIDE, height: 1 })
  })
})

describe('downscaleSteps', () => {
  it('halves big photos down to the target', () => {
    const steps = downscaleSteps({ width: 4000, height: 3000 }, { width: 480, height: 360 })
    expect(steps).toEqual([
      { width: 1920, height: 1440 },
      { width: 960, height: 720 },
      { width: 480, height: 360 },
    ])
  })

  it('draws once when the source is under twice the target', () => {
    expect(downscaleSteps({ width: 900, height: 600 }, { width: 480, height: 320 })).toEqual([
      { width: 480, height: 320 },
    ])
  })

  it('keeps intermediate canvases under the Safari area limit', () => {
    const steps = downscaleSteps({ width: 40_000, height: 30_000 }, { width: 480, height: 360 })
    for (const s of steps) expect(s.width * s.height).toBeLessThanOrEqual(16_000_000)
    expect(steps.at(-1)).toEqual({ width: 480, height: 360 })
  })
})

describe('hasAlpha', () => {
  it('detects any non-opaque pixel', () => {
    const opaque = new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255])
    const translucent = new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 254])
    expect(hasAlpha(opaque)).toBe(false)
    expect(hasAlpha(translucent)).toBe(true)
  })
})

describe('sha256Hex', () => {
  it('hashes bytes to lowercase hex', async () => {
    expect(await sha256Hex(new Blob(['abc']))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})
