import { describe, expect, it } from 'vitest'
import { assertDecodableSize, MAX_DECODE_PIXELS, readImageSize, sniffBlobSize } from './dimensions'
import { processImage } from './process'

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(
    parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)),
  )
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const le16 = (n: number) => [n & 255, (n >> 8) & 255]
const le24 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255]
const le32 = (n: number) => [...le16(n & 0xffff), ...le16(n >>> 16)]

const png = (w: number, h: number) =>
  bytes(
    [0x89],
    'PNG',
    [0x0d, 0x0a, 0x1a, 0x0a],
    be32(13),
    'IHDR',
    be32(w),
    be32(h),
    [8, 6, 0, 0, 0],
  )

describe('readImageSize', () => {
  it('reads PNG, GIF and BMP headers', () => {
    expect(readImageSize(png(640, 480))).toEqual({ width: 640, height: 480 })
    expect(readImageSize(bytes('GIF89a', le16(320), le16(200)))).toEqual({
      width: 320,
      height: 200,
    })
    const bmp = bytes('BM', new Array(16).fill(0), le32(800), le32(-600), [0, 0])
    expect(readImageSize(bmp)).toEqual({ width: 800, height: 600 })
  })

  it('reads all three WebP flavours', () => {
    const riff = (chunk: string, body: number[]) =>
      bytes('RIFF', le32(100), 'WEBP', chunk, le32(10), body, new Array(8).fill(0))
    // VP8: frame tag (3) + start code (3), then 14-bit width and height.
    expect(
      readImageSize(riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(1024), ...le16(768)])),
    ).toEqual({ width: 1024, height: 768 })
    // VP8L: signature 0x2f, then 14-bit (width - 1) and (height - 1).
    const w = 4000 - 1
    const h = 3000 - 1
    const vp8l = [0x2f, w & 255, ((w >> 8) & 0x3f) | ((h & 3) << 6), (h >> 2) & 255, (h >> 10) & 15]
    expect(readImageSize(riff('VP8L', vp8l))).toEqual({ width: 4000, height: 3000 })
    // VP8X: flags (4), then 24-bit (width - 1) and (height - 1).
    expect(readImageSize(riff('VP8X', [0, 0, 0, 0, ...le24(49_999), ...le24(49_999)]))).toEqual({
      width: 50_000,
      height: 50_000,
    })
  })

  it('walks JPEG segments to the frame header', () => {
    const app1 = [0xff, 0xe1, 0x00, 0x10, ...new Array(14).fill(0)]
    const sof2 = [0xff, 0xc2, 0x00, 0x11, 8, 0x0b, 0xb8, 0x0f, 0xa0, 3]
    const jpeg = bytes([0xff, 0xd8], app1, [0xff], sof2, new Array(16).fill(0))
    expect(readImageSize(jpeg)).toEqual({ width: 4000, height: 3000 })
  })

  it('takes the largest ispe box of an AVIF or HEIC file', () => {
    const ispe = (w: number, h: number) => [
      ...be32(20),
      ...bytes('ispe'),
      0,
      0,
      0,
      0,
      ...be32(w),
      ...be32(h),
    ]
    const avif = bytes(
      be32(24),
      'ftypavif',
      new Array(12).fill(0),
      ispe(512, 512),
      ispe(8192, 6144),
    )
    expect(readImageSize(avif)).toEqual({ width: 8192, height: 6144 })
  })

  it('returns null for formats it does not know', () => {
    expect(readImageSize(bytes('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
    expect(readImageSize(new Uint8Array(0))).toBeNull()
    expect(readImageSize(bytes([0xff, 0xd8, 0x12, 0x34]))).toBeNull()
  })
})

describe('assertDecodableSize', () => {
  it('allows big photos and unknown sizes, refuses pixel floods', () => {
    expect(() => assertDecodableSize({ width: 8192, height: 6144 })).not.toThrow()
    expect(() => assertDecodableSize(null)).not.toThrow()
    expect(() => assertDecodableSize({ width: 30_000, height: 30_000 })).toThrow(/too large/)
    expect(() => assertDecodableSize({ width: 40_000, height: 10 })).toThrow(/too large/)
    expect(MAX_DECODE_PIXELS).toBeGreaterThanOrEqual(50_000_000)
  })
})

describe('pixel flood protection', () => {
  it('sniffs a Blob without reading all of it', async () => {
    expect(await sniffBlobSize(new Blob([png(30_000, 30_000)]))).toEqual({
      width: 30_000,
      height: 30_000,
    })
  })

  it('stops processImage before any decoder runs', async () => {
    const flood = new Blob([png(60_000, 60_000)], { type: 'image/png' })
    await expect(processImage(flood)).rejects.toThrow(/too large/)
  })
})
