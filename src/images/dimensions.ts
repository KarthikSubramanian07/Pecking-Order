/**
 * Pixel dimensions read straight from an image file's header, without
 * decoding it. A small file can declare an enormous canvas (a "pixel flood":
 * a 50 kB PNG of 30 000 × 30 000 blank pixels decodes to 3.6 GB), so sizes
 * are checked before anything is handed to a decoder.
 *
 * Covers PNG, GIF, BMP, WebP (lossy, lossless, extended), JPEG and
 * ISO-BMFF images (AVIF, HEIC). Anything else returns null and is left to the
 * browser's own decoder limits.
 */
import type { Size } from './pipeline'

/** Bigger than any phone camera's default mode; a decode stays under ~400 MB. */
export const MAX_DECODE_PIXELS = 100_000_000
/** Browsers refuse canvases beyond this on a side anyway. */
export const MAX_DECODE_SIDE = 32_767

export function readImageSize(bytes: Uint8Array): Size | null {
  const at = (i: number) => bytes[i] ?? 0
  const u16be = (i: number) => (at(i) << 8) | at(i + 1)
  const u16le = (i: number) => at(i) | (at(i + 1) << 8)
  const u24le = (i: number) => at(i) | (at(i + 1) << 8) | (at(i + 2) << 16)
  const u32be = (i: number) =>
    ((at(i) << 24) | (at(i + 1) << 16) | (at(i + 2) << 8) | at(i + 3)) >>> 0
  const i32le = (i: number) => at(i) | (at(i + 1) << 8) | (at(i + 2) << 16) | (at(i + 3) << 24)
  const ascii = (i: number, text: string) =>
    [...text].every((c, k) => at(i + k) === c.charCodeAt(0))

  if (bytes.length >= 24 && at(0) === 0x89 && ascii(1, 'PNG') && ascii(12, 'IHDR')) {
    return { width: u32be(16), height: u32be(20) }
  }
  if (bytes.length >= 10 && ascii(0, 'GIF8')) return { width: u16le(6), height: u16le(8) }
  if (bytes.length >= 26 && ascii(0, 'BM')) {
    return { width: Math.abs(i32le(18)), height: Math.abs(i32le(22)) }
  }
  if (bytes.length >= 30 && ascii(0, 'RIFF') && ascii(8, 'WEBP')) {
    if (ascii(12, 'VP8 ')) return { width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff }
    if (ascii(12, 'VP8L')) {
      const [b0, b1, b2, b3] = [at(21), at(22), at(23), at(24)]
      return {
        width: 1 + (((b1 & 0x3f) << 8) | b0),
        height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
      }
    }
    if (ascii(12, 'VP8X')) return { width: 1 + u24le(24), height: 1 + u24le(27) }
    return null
  }
  if (at(0) === 0xff && at(1) === 0xd8) return jpegSize(bytes, u16be)
  if (ascii(4, 'ftyp')) return isoBmffSize(bytes, u32be)
  return null
}

/** Start-of-frame markers carry the frame size; DHT (C4), JPG (C8) and DAC (CC) do not. */
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])

function jpegSize(bytes: Uint8Array, u16be: (i: number) => number): Size | null {
  let i = 2
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null
    const marker = bytes[i + 1] ?? 0
    if (marker === 0xff) {
      i++ // fill byte
      continue
    }
    if (SOF.has(marker)) return { width: u16be(i + 7), height: u16be(i + 5) }
    if (marker === 0xd9 || marker === 0xda) return null // end of image, start of scan
    if ((marker >= 0xd0 && marker <= 0xd8) || marker === 0x01) {
      i += 2 // standalone markers have no length
      continue
    }
    i += 2 + u16be(i + 2)
  }
  return null
}

/** The largest `ispe` (image spatial extents) box: grids list each tile and the whole. */
function isoBmffSize(bytes: Uint8Array, u32be: (i: number) => number): Size | null {
  let best: Size | null = null
  for (let i = 8; i + 16 <= bytes.length; i++) {
    if (
      bytes[i] !== 0x69 ||
      bytes[i + 1] !== 0x73 ||
      bytes[i + 2] !== 0x70 ||
      bytes[i + 3] !== 0x65
    )
      continue
    const size = { width: u32be(i + 8), height: u32be(i + 12) }
    if (!best || size.width * size.height > best.width * best.height) best = size
  }
  return best
}

/** Throws a friendly error when a header declares more pixels than we will decode. */
export function assertDecodableSize(size: Size | null): void {
  if (!size) return
  const { width, height } = size
  if (width > MAX_DECODE_SIDE || height > MAX_DECODE_SIDE || width * height > MAX_DECODE_PIXELS) {
    throw new Error('That image is too large to open (over 100 megapixels).')
  }
}

/**
 * Bytes enough for the header of every format above. JPEG metadata can push
 * the frame header further in, so callers retry with the whole file then.
 */
export const HEADER_BYTES = 1024 * 1024

/** Reads a Blob's declared size from its first bytes, then from all of it if needed. */
export async function sniffBlobSize(blob: Blob): Promise<Size | null> {
  const head = new Uint8Array(await blob.slice(0, HEADER_BYTES).arrayBuffer())
  const size = readImageSize(head)
  if (size || blob.size <= HEADER_BYTES) return size
  return readImageSize(new Uint8Array(await blob.arrayBuffer()))
}
