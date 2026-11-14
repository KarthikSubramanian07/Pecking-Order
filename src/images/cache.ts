/**
 * Session cache of object URLs for stored images, so each Blob is turned into
 * a URL once no matter how many cards render it.
 */
import type { ImageHash } from '@/core/types'
import { getImage } from '@/storage/db'

const urls = new Map<ImageHash, string>()
const pending = new Map<ImageHash, Promise<string | null>>()

export function cachedImageUrl(hash: ImageHash): string | undefined {
  return urls.get(hash)
}

export function imageUrl(hash: ImageHash): Promise<string | null> {
  const hit = urls.get(hash)
  if (hit) return Promise.resolve(hit)
  let p = pending.get(hash)
  if (!p) {
    p = getImage(hash)
      .then((img) => {
        if (!img) return null
        const url = URL.createObjectURL(img.blob)
        urls.set(hash, url)
        return url
      })
      .finally(() => pending.delete(hash))
    pending.set(hash, p)
  }
  return p
}

/** Seed the cache right after ingesting, avoiding a round trip to IndexedDB. */
export function primeImageUrl(hash: ImageHash, blob: Blob): void {
  if (!urls.has(hash)) urls.set(hash, URL.createObjectURL(blob))
}
