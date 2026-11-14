/**
 * `.peck` files: a whole board, tiers, items and images, in one portable
 * zip, for backups and moving between devices without an account.
 *
 *   board.json          the Board (validated on import like any untrusted input)
 *   images/<sha256>     raw image bytes, stored uncompressed (already compressed)
 *   peck.json           { format: 'pecking-order', version: 1 }
 *
 * Imports are defensive: zip-bomb limits per entry and per file, only the
 * images the validated board references are inflated, every image is
 * hash-verified, magic-byte sniffed and size-checked from its header (never
 * decoded here), and the board goes through full validation.
 */
import { referencedImages } from '@/core/board'
import { newId } from '@/core/ids'
import type { Board } from '@/core/types'
import { parseBoard } from '@/core/validate'
import { readImageSize } from '@/images/dimensions'
import { getBoard, getImage, putImage, type StoredImage } from './db'

const MAX_FILE_BYTES = 200 * 1024 * 1024
const MAX_ENTRIES = 2100
/** board.json: 2000 items with long labels and credits stay well below this. */
const MAX_JSON_BYTES = 20 * 1024 * 1024
/** Exports only hold processed images (at most 480 px a side), usually a few dozen kB. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_IMAGE_SIDE = 4096
/** Everything inflated from one file, together: the real zip-bomb guard. */
const MAX_TOTAL_BYTES = 250 * 1024 * 1024

const TOO_MUCH = 'That file has too much in it.'
const NOT_PECK = "That doesn't look like a .peck file."
const IMAGE_ENTRY = /^images\/[0-9a-f]{64}$/

const MANIFEST = { format: 'pecking-order', version: 1 } as const

export async function exportPeck(board: Board): Promise<Blob> {
  const { zipSync, strToU8 } = await import('fflate')
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    'peck.json': strToU8(JSON.stringify(MANIFEST)),
    'board.json': strToU8(JSON.stringify(board)),
  }
  for (const hash of referencedImages(board)) {
    const img = await getImage(hash)
    if (img) files[`images/${hash}`] = [new Uint8Array(await img.blob.arrayBuffer()), { level: 0 }]
  }
  const zipped = zipSync(files, { level: 6 })
  return new Blob([zipped as BlobPart], { type: 'application/zip' })
}

/** Sniffs common image formats by magic bytes, never trust the extension. */
export function sniffImageType(bytes: Uint8Array): string | null {
  const b = (i: number) => bytes[i] ?? -1
  const ascii = (i: number, text: string) => [...text].every((c, k) => b(i + k) === c.charCodeAt(0))
  if (b(0) === 0x89 && ascii(1, 'PNG')) return 'image/png'
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg'
  if (ascii(0, 'GIF8')) return 'image/gif'
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp'
  // Every ISO-BMFF file (MP4, MOV, HEIC...) starts with ftyp: require an AVIF brand.
  if (ascii(4, 'ftyp') && (ascii(8, 'avif') || ascii(8, 'avis'))) return 'image/avif'
  return null
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

/**
 * Inflates only the entries `wanted` accepts. Sizes come from the zip's
 * directory, and fflate never writes past a declared size, so checking them
 * here bounds memory before a single byte is inflated: per entry, and across
 * the whole file through the shared `budget`.
 */
async function unzipSome(
  data: Uint8Array,
  wanted: (name: string) => boolean,
  budget: { left: number },
): Promise<Record<string, Uint8Array>> {
  const { unzipSync } = await import('fflate')
  let entries = 0
  try {
    return unzipSync(data, {
      filter: (f) => {
        if (++entries > MAX_ENTRIES) throw new Error(TOO_MUCH)
        if (!wanted(f.name)) return false
        const size = Math.max(f.size, f.originalSize)
        const limit = IMAGE_ENTRY.test(f.name) ? MAX_IMAGE_BYTES : MAX_JSON_BYTES
        budget.left -= size
        if (size > limit || budget.left < 0) throw new Error(TOO_MUCH)
        return true
      },
    })
  } catch (err) {
    if (err instanceof Error && err.message === TOO_MUCH) throw err
    throw new Error(NOT_PECK)
  }
}

function parseJson(data: Uint8Array | undefined, decode: (d: Uint8Array) => string): unknown {
  if (!data) throw new Error(NOT_PECK)
  try {
    return JSON.parse(decode(data))
  } catch {
    throw new Error(NOT_PECK)
  }
}

/** Header-declared size, if it is one a processed tile could plausibly have. */
function plausibleSize(bytes: Uint8Array): { width: number; height: number } | null {
  const size = readImageSize(bytes)
  if (!size || size.width < 1 || size.height < 1) return null
  return size.width <= MAX_IMAGE_SIDE && size.height <= MAX_IMAGE_SIDE ? size : null
}

export interface PeckImport {
  board: Board
  /** Images that were missing, corrupt or failed verification. */
  skippedImages: number
}

export async function importPeck(file: Blob): Promise<PeckImport> {
  if (file.size > MAX_FILE_BYTES)
    throw new Error('That file is too big to be a Pecking Order board.')
  const { strFromU8 } = await import('fflate')
  const data = new Uint8Array(await file.arrayBuffer())
  const budget = { left: MAX_TOTAL_BYTES }

  const meta = await unzipSome(data, (n) => n === 'peck.json' || n === 'board.json', budget)
  const manifest = parseJson(meta['peck.json'], strFromU8)
  if (typeof manifest !== 'object' || manifest === null) throw new Error(NOT_PECK)
  const { format, version } = manifest as { format?: unknown; version?: unknown }
  if (format !== MANIFEST.format) throw new Error(NOT_PECK)
  if (version !== MANIFEST.version) throw new Error('This .peck file is from a newer version.')

  const board = parseBoard(parseJson(meta['board.json'], strFromU8))
  if (await getBoard(board.id)) board.id = newId('b')

  // Second pass: inflate only the images the validated board actually uses.
  const referenced = referencedImages(board)
  const images = await unzipSome(
    data,
    (n) => IMAGE_ENTRY.test(n) && referenced.has(n.slice('images/'.length)),
    budget,
  )

  let skippedImages = 0
  for (const hash of referenced) {
    const bytes = images[`images/${hash}`]
    const type = bytes ? sniffImageType(bytes) : null
    const size = bytes && type ? plausibleSize(bytes) : null
    if (!bytes || !type || !size || (await sha256Hex(bytes)) !== hash) {
      skippedImages++
      for (const item of Object.values(board.items)) if (item.image === hash) delete item.image
      continue
    }
    const blob = new Blob([bytes as BlobPart], { type })
    const stored: StoredImage = { hash, blob, ...size, createdAt: Date.now() }
    await putImage(stored)
  }
  return { board, skippedImages }
}
