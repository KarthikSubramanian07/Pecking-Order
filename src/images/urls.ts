/**
 * Validating and downloading remote images. Only http(s) URLs on public hosts
 * are ever fetched, and `data:image/*` URLs are decoded in place without any
 * request; everything else (javascript:, file:, blob:, localhost, private
 * network addresses…) is rejected before anything happens.
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
  if (url.username || url.password) throw new Error('Image links with a password are not added.')
  if (!isPublicHostname(url.hostname)) {
    throw new Error('Links to this device or a private network are not fetched.')
  }
  return url
}

// ─── Public hosts only ────────────────────────────────────────────────────

/** Names that only ever resolve inside a device or a local network. */
const LOCAL_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa', '.intranet']

/**
 * False for loopback, private, link-local, CGNAT, multicast and reserved
 * addresses, single-label intranet names and local-only domains. A pasted or
 * dropped link must never make the browser probe a router or a dev server.
 * `hostname` is the already-normalised `URL#hostname` (the URL parser turns
 * `0x7f.1` or `2130706433` into `127.0.0.1`).
 */
export function isPublicHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (!host) return false
  if (host.startsWith('[')) return isPublicIpv6(host.slice(1, -1))
  const v4 = parseIpv4(host)
  if (v4) return isPublicIpv4(v4)
  if (host === 'localhost' || !host.includes('.')) return false
  return !LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))
}

type Quad = [number, number, number, number]

function parseIpv4(host: string): Quad | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!m) return null
  const quad = m.slice(1).map(Number) as Quad
  return quad.every((n) => n <= 255) ? quad : null
}

function isPublicIpv4([a, b, c]: Quad): boolean {
  if (a === 0 || a === 10 || a === 127) return false // this network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return false // carrier-grade NAT
  if (a === 169 && b === 254) return false // link-local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false // private
  if (a === 192 && b === 168) return false // private
  if (a === 192 && b === 0 && c === 0) return false // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return false // benchmarking
  return a < 224 // multicast and reserved
}

function isPublicIpv6(address: string): boolean {
  const groups = expandIpv6(address)
  if (!groups) return false
  const [first = 0] = groups
  if (groups.every((g) => g === 0)) return false // unspecified ::
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return false // loopback ::1
  if ((first & 0xfe00) === 0xfc00) return false // unique local fc00::/7
  if ((first & 0xffc0) === 0xfe80) return false // link-local fe80::/10
  if ((first & 0xff00) === 0xff00) return false // multicast
  // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::a.b.c.d) carry an IPv4 address.
  const mapped = groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff
  const nat64 = first === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((g) => g === 0)
  if (mapped || nat64) {
    const hi = groups[6] ?? 0
    const lo = groups[7] ?? 0
    return isPublicIpv4([hi >> 8, hi & 255, lo >> 8, lo & 255])
  }
  return true
}

/** Eight 16-bit groups from a serialised IPv6 address (as `URL` prints it), or null. */
function expandIpv6(address: string): number[] | null {
  const halves = address.split('::')
  if (halves.length > 2) return null
  const parse = (part: string) => (part ? part.split(':') : [])
  const head = parse(halves[0] ?? '')
  const tail = parse(halves[1] ?? '')
  const missing = 8 - head.length - tail.length
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null
  const all = [...head, ...Array<string>(missing).fill('0'), ...tail]
  const groups = all.map((g) => (/^[0-9a-f]{1,4}$/i.test(g) ? Number.parseInt(g, 16) : Number.NaN))
  return groups.every(Number.isFinite) ? groups : null
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
 * early rather than downloaded in full). `data:` URLs are decoded locally.
 */
export async function fetchImageBlob(url: URL, signal?: AbortSignal): Promise<Blob> {
  if (url.protocol === 'data:') {
    signal?.throwIfAborted()
    return decodeDataUrl(url.href)
  }
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

// ─── data: URLs ───────────────────────────────────────────────────────────

/**
 * Decodes a `data:image/*` URL into a Blob without fetch(). The production
 * CSP keeps `data:` out of connect-src, and decoding by hand also lets the
 * size cap apply before any bytes are allocated.
 */
export function decodeDataUrl(href: string): Blob {
  const comma = href.indexOf(',')
  const header = comma === -1 ? '' : href.slice(5, comma)
  const params = header.split(';').map((p) => p.trim().toLowerCase())
  const type = params[0] ?? ''
  if (!/^data:/i.test(href) || !/^image\/[a-z0-9.+-]+$/.test(type)) {
    throw new Error('Only pasted image data can be added.')
  }
  const payload = href.slice(comma + 1)
  // Check before decoding: base64 grows data by 4/3; plain payloads are capped as text.
  const isBase64 = params.includes('base64')
  if (payload.length > (isBase64 ? (MAX_REMOTE_BYTES * 4) / 3 + 4 : MAX_REMOTE_BYTES)) {
    throw tooBig()
  }
  const bytes = isBase64 ? base64Bytes(payload) : percentDecode(payload)
  if (bytes.byteLength > MAX_REMOTE_BYTES) throw tooBig()
  if (bytes.byteLength === 0) throw new Error('That pasted image is empty.')
  return new Blob([bytes as BlobPart], { type })
}

/** Byte-wise percent decoding; other characters are kept as UTF-8. */
function percentDecode(text: string): Uint8Array {
  const encoder = new TextEncoder()
  if (!text.includes('%')) return encoder.encode(text)
  // Every input character yields at most 3 bytes, and an escape (3 characters) yields 1.
  const out = new Uint8Array(text.length * 3)
  let at = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code === 0x25 && isHexPair(text, i + 1)) {
      out[at++] = Number.parseInt(text.slice(i + 1, i + 3), 16)
      i += 2
    } else if (code < 0x80) {
      out[at++] = code
    } else {
      const pair = code >= 0xd800 && code <= 0xdbff ? 2 : 1
      at += encoder.encodeInto(text.slice(i, i + pair), out.subarray(at)).written
      i += pair - 1
    }
  }
  return out.slice(0, at)
}

function isHexPair(text: string, at: number): boolean {
  return /^[0-9a-f]{2}$/i.test(text.slice(at, at + 2))
}

function base64Bytes(payload: string): Uint8Array {
  let binary: string
  try {
    // atob ignores ASCII whitespace, as data: URLs require.
    binary = atob(payload.includes('%') ? decodeURIComponent(payload) : payload)
  } catch {
    throw new Error("That pasted image couldn't be read.")
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
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
