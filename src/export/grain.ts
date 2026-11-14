/**
 * Paper grain. A small seeded noise tile, repeated as a pattern, seeded so
 * the same board always exports byte-identical pixels (stable tests, no
 * flicker between preview and download).
 */

export const GRAIN_TILE = 96

/** mulberry32: tiny, fast, good-enough PRNG for visual noise. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Sparse two-tone speckle: most pixels stay transparent. Dense per-pixel noise
 * looks the same at 3% opacity but defeats PNG compression (≈3× larger files).
 */
export function grainPixels(
  size = GRAIN_TILE,
  seed = 0x5eed,
  density = 0.06,
): Uint8ClampedArray<ArrayBuffer> {
  const rand = seededRandom(seed)
  const px = new Uint8ClampedArray(size * size * 4)
  for (let i = 0; i < px.length; i += 4) {
    if (rand() >= density) continue
    const v = rand() < 0.5 ? 0 : 255
    px[i] = v
    px[i + 1] = v
    px[i + 2] = v
    px[i + 3] = 255
  }
  return px
}

/** Stable 32-bit hash of a string (FNV-1a), used to seed per-board wobble. */
export function hashString(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
