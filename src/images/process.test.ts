import { describe, expect, it } from 'vitest'
import { assertProcessable, MAX_INPUT_BYTES, processImage, svgRasterSize } from './process'

describe('assertProcessable', () => {
  it('rejects non-images', () => {
    expect(() => assertProcessable(new Blob(['hi'], { type: 'text/plain' }))).toThrow(
      /isn't an image/,
    )
  })

  it('rejects empty and oversized files', () => {
    expect(() => assertProcessable(new Blob([], { type: 'image/png' }))).toThrow(/empty/)
    const huge = new Blob([new Uint8Array(MAX_INPUT_BYTES + 1)], { type: 'image/jpeg' })
    expect(() => assertProcessable(huge)).toThrow(/25 MB/)
  })

  it('lets untyped blobs through for the decoder to judge', () => {
    expect(() => assertProcessable(new Blob(['x']))).not.toThrow()
  })
})

describe('processImage', () => {
  it('rejects before doing any decoding work', async () => {
    await expect(processImage(new Blob(['%PDF'], { type: 'application/pdf' }))).rejects.toThrow(
      /isn't an image/,
    )
  })
})

describe('svgRasterSize', () => {
  it('keeps aspect ratio at a fixed long side', () => {
    expect(svgRasterSize({ width: 100, height: 50 })).toEqual({ width: 480, height: 240 })
    expect(svgRasterSize({ width: 2000, height: 4000 })).toEqual({ width: 240, height: 480 })
  })

  it('falls back to a square when the SVG declares no size', () => {
    expect(svgRasterSize({ width: 0, height: 0 })).toEqual({ width: 480, height: 480 })
  })
})
