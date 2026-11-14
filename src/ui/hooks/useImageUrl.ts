import { useEffect, useState } from 'react'
import type { ImageHash } from '@/core/types'
import { cachedImageUrl, imageUrl } from '@/images/cache'

/** Resolves an image hash to an object URL (sync on cache hit — no flicker). */
export function useImageUrl(hash: ImageHash | undefined): string | undefined {
  const [url, setUrl] = useState(() => (hash ? cachedImageUrl(hash) : undefined))
  useEffect(() => {
    if (!hash) {
      setUrl(undefined)
      return
    }
    const hit = cachedImageUrl(hash)
    if (hit) {
      setUrl(hit)
      return
    }
    let live = true
    void imageUrl(hash).then((u) => {
      if (live) setUrl(u ?? undefined)
    })
    return () => {
      live = false
    }
  }, [hash])
  return url
}
