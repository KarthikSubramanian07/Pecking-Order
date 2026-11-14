/**
 * Validating and downloading remote images. Only http(s) and `data:image/*`
 * URLs are ever fetched; everything else (javascript:, file:, blob:…) is
 * rejected before any request is made.
 */
import { deadline } from './net'

export const MAX_REMOTE_BYTES = 15 * 1024 * 1024
const FETCH_TIMEOUT_MS = 15_000

export const CORS_MESSAGE =
  "That site doesn't allow its images to be copied. Try downloading it and dropping the file in."

const IMAGE_PATH = /\.(avif|bmp|gif|ico|jpe?g|jfif|png|svg|webp)$/i

/** Parses and vets a URL a user handed us. Throws a friendly Error otherwise. */
export function parseImageUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new Error("That doesn't look like a web address.")
  }
  if (url.protocol === 'data:') {
    if (/^data:image\//i.test(url.href)) return url
    throw new Error('Only pasted image data can be added.')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Only http and https image links can be added.')
  }
  return url
}

/** A pasted line that is very likely an image, judged by its path's extension. */
export function isImageishUrl(text: string): boolean {
  if (/^data:image\//i.test(text)) return true
  if (!/^https?:\/\//i.test(text)) return false
  try {
    return IMAGE_PATH.test(new URL(text).pathname)
  } catch {
    return false
  }
}

/** Like `parseImageUrl`, but returns null instead of throwing. */
export function tryParseImageUrl(raw: string): URL | null {
  try {
    return parseImageUrl(raw)
  } catch {
    return null
  }
}

/**
 * Downloads an image with no cookies and no referrer. Enforces a timeout, an
 * image/* content type and a size cap (streamed, so a huge file is cut off
 * early rather than downloaded in full).
 */
export async function fetchImageBlob(url: URL, signal?: AbortSignal): Promise<Blob> {
  const target = upgradeInsecure(url)
  const timer = deadline(signal, FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(target.href, {
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: timer.signal,
    })
    if (!res.ok) throw new Error(`That image couldn't be downloaded (HTTP ${res.status}).`)
    const type = (res.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
    if (!type.startsWith('image/')) throw new Error("That link doesn't point to an image.")
    if (Number(res.headers.get('content-length')) > MAX_REMOTE_BYTES) throw tooBig()
    return await readCapped(res, type)
  } catch (err) {
    if (signal?.aborted) throw signal.reason
    if (timer.timedOut) throw new Error('That image took too long to download.')
    // fetch() reports CORS refusals and network failures as a bare TypeError.
    if (err instanceof TypeError) throw new Error(CORS_MESSAGE)
    throw err
  } finally {
    timer.dispose()
  }
}

function tooBig(): Error {
  return new Error('That image is over 15 MB.')
}

async function readCapped(res: Response, type: string): Promise<Blob> {
  const reader = res.body?.getReader()
  if (!reader) {
    const blob = await res.blob()
    if (blob.size > MAX_REMOTE_BYTES) throw tooBig()
    return blob
  }
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_REMOTE_BYTES) {
      await reader.cancel()
      throw tooBig()
    }
    chunks.push(value)
  }
  return new Blob(chunks, { type })
}

/** An https page cannot fetch http: (mixed content); most hosts serve both. */
function upgradeInsecure(url: URL): URL {
  if (url.protocol !== 'http:' || globalThis.location?.protocol !== 'https:') return url
  const upgraded = new URL(url.href)
  upgraded.protocol = 'https:'
  return upgraded
}
