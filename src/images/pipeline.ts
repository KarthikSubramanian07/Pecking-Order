/**
 * The pixel pipeline: downscale → encode → hash. It runs unchanged inside the
 * processing worker and on the main thread (the fallback), so it only touches
 * APIs that exist in both: OffscreenCanvas when present, a DOM canvas otherwise.
 */
import type { StoredImage } from '@/storage/db'

/** Cards render at most ~240 CSS px wide; 480 keeps them sharp on 2× screens. */
export const MAX_SIDE = 480
const QUALITY = 0.86
/** Safari refuses canvases above ~16.7 MP; intermediate steps stay below that. */
const MAX_CANVAS_AREA = 16_000_000

export interface Size {
  width: number
  height: number
}

/** Messages exchanged with `process.worker.ts`. */
export interface WorkerRequest {
  id: number
  blob: Blob
}
export type WorkerResponse =
  | { id: number; ok: true; image: StoredImage }
  | { id: number; ok: false; message: string }

/** Scales `size` so its longest side is at most `maxSide`. Never upscales. */
export function fitWithin(size: Size, maxSide = MAX_SIDE): Size {
  const longest = Math.max(size.width, size.height)
  if (longest <= maxSide) return { width: size.width, height: size.height }
  const scale = maxSide / longest
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  }
}

/**
 * Canvas sizes to draw through, largest first, ending at `target`.
 * A single big jump (4000px → 480px) aliases badly even with high-quality
 * smoothing, so big photos are halved repeatedly; each later step is exactly 2×.
 */
export function downscaleSteps(source: Size, target: Size): Size[] {
  const steps: Size[] = [target]
  let last = target
  for (;;) {
    const next = { width: last.width * 2, height: last.height * 2 }
    if (next.width * 2 > source.width || next.height * 2 > source.height) break
    if (next.width * next.height > MAX_CANVAS_AREA) break
    steps.push(next)
    last = next
  }
  return steps.reverse()
}

/** True if any pixel is not fully opaque. Scans every pixel: ≤230k at 480². */
export function hasAlpha(rgba: Uint8ClampedArray): boolean {
  for (let i = 3; i < rgba.length; i += 4) {
    if ((rgba[i] ?? 255) < 255) return true
  }
  return false
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

type Canvas = OffscreenCanvas | HTMLCanvasElement
type Context = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D

function makeCanvas({ width, height }: Size): { canvas: Canvas; ctx: Context } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (ctx) return { canvas, ctx }
  } else if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (ctx) return { canvas, ctx }
  }
  throw new Error('This browser cannot resize images.')
}

function toBlob(canvas: Canvas, type: string, quality?: number): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality })
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Image encoding failed.'))),
      type,
      quality,
    )
  })
}

/**
 * WebP first. Safari cannot encode WebP and silently returns PNG instead, so
 * check what we actually got: keep PNG only when transparency needs it,
 * otherwise JPEG is far smaller for photos.
 */
async function encode(canvas: Canvas, ctx: Context, size: Size): Promise<Blob> {
  const webp = await toBlob(canvas, 'image/webp', QUALITY)
  if (webp.type === 'image/webp') return webp
  if (hasAlpha(ctx.getImageData(0, 0, size.width, size.height).data)) {
    return webp.type === 'image/png' ? webp : toBlob(canvas, 'image/png')
  }
  return toBlob(canvas, 'image/jpeg', QUALITY)
}

/** Downscales a decoded image, encodes it and hashes the encoded bytes. */
export async function rasterize(source: CanvasImageSource, size: Size): Promise<StoredImage> {
  const target = fitWithin(size)
  let current: CanvasImageSource = source
  let previous: Canvas | null = null
  let out: { canvas: Canvas; ctx: Context } | null = null
  for (const step of downscaleSteps(size, target)) {
    out = makeCanvas(step)
    out.ctx.imageSmoothingEnabled = true
    out.ctx.imageSmoothingQuality = 'high'
    out.ctx.drawImage(current, 0, 0, step.width, step.height)
    // Free intermediate pixels promptly; Safari is slow to reclaim canvases.
    if (previous) previous.width = previous.height = 0
    previous = out.canvas
    current = out.canvas
  }
  if (!out) throw new Error('Image encoding failed.')
  const blob = await encode(out.canvas, out.ctx, target)
  return {
    hash: await sha256Hex(blob),
    blob,
    width: target.width,
    height: target.height,
    createdAt: Date.now(),
  }
}

/**
 * Decodes with EXIF orientation applied. Animated GIFs/WebPs yield their first
 * frame only — fine for v1 tier cards.
 */
export async function decodeBitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob, { imageOrientation: 'from-image' })
}

/** Full pipeline from encoded bytes; what the worker runs. */
export async function processBitmapBlob(blob: Blob): Promise<StoredImage> {
  const bitmap = await decodeBitmap(blob)
  try {
    return await rasterize(bitmap, { width: bitmap.width, height: bitmap.height })
  } finally {
    bitmap.close()
  }
}
