/**
 * `.peck` files: a whole board, tiers, items and images, in one portable
 * zip, for backups and moving between devices without an account.
 *
 *   board.json          the Board (validated on import like any untrusted input)
 *   images/<sha256>     raw image bytes, stored uncompressed (already compressed)
 *   peck.json           { format: 'pecking-order', version: 1 }
 *
 * Imports are defensive: zip-bomb limits, hash verification of every image,
 * magic-byte sniffing, and full board validation.
 */
import { referencedImages } from '@/core/board'
import { newId } from '@/core/ids'
import type { Board } from '@/core/types'
import { parseBoard } from '@/core/validate'
import { getBoard, getImage, putImage, type StoredImage } from './db'

const MAX_FILE_BYTES = 200 * 1024 * 1024
const MAX_ENTRY_BYTES = 20 * 1024 * 1024
const MAX_ENTRIES = 2100

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
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return 'image/png'
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg'
  if (b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46) return 'image/gif'
  const riff = b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46
  if (riff && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50)
    return 'image/webp'
  if (b(4) === 0x66 && b(5) === 0x74 && b(6) === 0x79 && b(7) === 0x70) return 'image/avif'
  return null
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

async function dimensions(blob: Blob): Promise<{ width: number; height: number }> {
  try {
    const bmp = await createImageBitmap(blob)
    const size = { width: bmp.width, height: bmp.height }
    bmp.close()
    return size
  } catch {
    return { width: 0, height: 0 }
  }
}

export interface PeckImport {
  board: Board
  /** Images that were missing, corrupt or failed verification. */
  skippedImages: number
}

export async function importPeck(file: Blob): Promise<PeckImport> {
  if (file.size > MAX_FILE_BYTES)
    throw new Error('That file is too big to be a Pecking Order board.')
  const { unzipSync, strFromU8 } = await import('fflate')
  let entries = 0
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      // Reject zip bombs before inflating anything.
      filter: (f) => {
        entries++
        if (entries > MAX_ENTRIES || f.originalSize > MAX_ENTRY_BYTES) {
          throw new Error('That file has too much in it.')
        }
        return (
          f.name === 'peck.json' || f.name === 'board.json' || /^images\/[0-9a-f]{64}$/.test(f.name)
        )
      },
    })
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('That file')) throw err
    throw new Error("That doesn't look like a .peck file.")
  }

  const json = (name: string): unknown => {
    const data = files[name]
    if (!data) throw new Error("That doesn't look like a .peck file.")
    return JSON.parse(strFromU8(data))
  }
  const manifest = json('peck.json') as { format?: unknown; version?: unknown }
  if (manifest.format !== MANIFEST.format) throw new Error("That doesn't look like a .peck file.")
  if (manifest.version !== MANIFEST.version)
    throw new Error('This .peck file is from a newer version.')

  const board = parseBoard(json('board.json'))
  if (await getBoard(board.id)) board.id = newId('b')

  let skippedImages = 0
  for (const hash of referencedImages(board)) {
    const bytes = files[`images/${hash}`]
    const type = bytes ? sniffImageType(bytes) : null
    if (!bytes || !type || (await sha256Hex(bytes)) !== hash) {
      skippedImages++
      for (const item of Object.values(board.items)) if (item.image === hash) delete item.image
      continue
    }
    const blob = new Blob([bytes as BlobPart], { type })
    const stored: StoredImage = { hash, blob, ...(await dimensions(blob)), createdAt: Date.now() }
    await putImage(stored)
  }
  return { board, skippedImages }
}
