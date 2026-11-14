/**
 * Turns any image the user hands us into a small, content-addressed WebP
 * (or JPEG/PNG where WebP encoding is unavailable).
 *
 * Why a worker: decoding and resizing a 12–50 MP phone photo costs 50–300 ms
 * of CPU. Dropping a folder of them on the main thread would freeze drag
 * animations for seconds. The worker keeps the UI responsive; the main thread
 * is only used as a fallback, for SVG (which needs <img>, a DOM-only API) and
 * for browsers without OffscreenCanvas or module workers.
 */
import type { StoredImage } from '@/storage/db'
import { assertDecodableSize, sniffBlobSize } from './dimensions'
import { processBitmapBlob, rasterize, type Size, type WorkerResponse } from './pipeline'

export const MAX_INPUT_BYTES = 25 * 1024 * 1024
/** SVGs have no natural pixel size worth trusting; rasterise at this long side. */
const SVG_RASTER_SIDE = 480

const SVG_TYPE = 'image/svg+xml'

/** Rejects things that cannot possibly be processed, with a message fit for a toast. */
export function assertProcessable(blob: Blob): void {
  // An empty type is common for drags out of some apps; let the decoder decide.
  if (blob.type && !blob.type.startsWith('image/')) throw new Error("That file isn't an image.")
  if (blob.size === 0) throw new Error('That file is empty.')
  if (blob.size > MAX_INPUT_BYTES) throw new Error('That image is over 25 MB.')
}

export async function processImage(blob: Blob): Promise<StoredImage> {
  assertProcessable(blob)
  if (blob.type !== SVG_TYPE) {
    // Before any decoder sees it: a tiny file can declare billions of pixels.
    assertDecodableSize(await sniffBlobSize(blob))
    const worker = processingWorker()
    if (worker) {
      try {
        return await worker.run(blob)
      } catch {
        // Formats only <img> can decode, or a worker without canvas support:
        // retry on the main thread, which has more decoders available.
      }
    }
  }
  return processOnMainThread(blob)
}

// ─── Worker client ────────────────────────────────────────────────────────

interface Pending {
  resolve: (image: StoredImage) => void
  reject: (err: Error) => void
}

class ProcessingWorker {
  private readonly worker: Worker
  private readonly pending = new Map<number, Pending>()
  private nextId = 0

  constructor(onBroken: () => void) {
    this.worker = new Worker(new URL('./process.worker.ts', import.meta.url), { type: 'module' })
    this.worker.addEventListener('message', (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data
      const job = this.pending.get(msg.id)
      if (!job) return
      this.pending.delete(msg.id)
      if (msg.ok) job.resolve(msg.image)
      else job.reject(new Error(msg.message))
    })
    // Fires when the module fails to load (CSP, old browser). Never retry it.
    this.worker.addEventListener('error', () => {
      onBroken()
      this.worker.terminate()
      for (const job of this.pending.values()) job.reject(new Error('Image worker failed.'))
      this.pending.clear()
    })
  }

  run(blob: Blob): Promise<StoredImage> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.worker.postMessage({ id, blob })
    })
  }
}

let worker: ProcessingWorker | null | undefined

function processingWorker(): ProcessingWorker | null {
  if (worker !== undefined) return worker
  const supported =
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof createImageBitmap === 'function'
  try {
    worker = supported
      ? new ProcessingWorker(() => {
          worker = null
        })
      : null
  } catch {
    worker = null
  }
  return worker
}

// ─── Main-thread fallback ─────────────────────────────────────────────────

async function processOnMainThread(blob: Blob): Promise<StoredImage> {
  if (blob.type !== SVG_TYPE && typeof createImageBitmap === 'function') {
    try {
      return await processBitmapBlob(blob)
    } catch {
      // Fall through to <img>, which some browsers decode more formats with.
    }
  }
  return processWithImageElement(blob)
}

/**
 * <img> decoding. SVG loaded this way runs no scripts and fetches nothing, and
 * we only ever keep the rasterised pixels, never the SVG source.
 */
async function processWithImageElement(blob: Blob): Promise<StoredImage> {
  if (typeof Image === 'undefined') throw new Error("Couldn't read that image.")
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    try {
      await img.decode()
    } catch {
      throw new Error("Couldn't read that image. It may be damaged or in an unsupported format.")
    }
    const natural = { width: img.naturalWidth, height: img.naturalHeight }
    const size = blob.type === SVG_TYPE ? svgRasterSize(natural) : natural
    if (!size.width || !size.height) throw new Error("Couldn't read that image.")
    return await rasterize(img, size)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Keeps the SVG's aspect ratio (square if it declares none) at a fixed long side. */
export function svgRasterSize(natural: Size): Size {
  if (!natural.width || !natural.height) return { width: SVG_RASTER_SIDE, height: SVG_RASTER_SIDE }
  const scale = SVG_RASTER_SIDE / Math.max(natural.width, natural.height)
  return {
    width: Math.max(1, Math.round(natural.width * scale)),
    height: Math.max(1, Math.round(natural.height * scale)),
  }
}
