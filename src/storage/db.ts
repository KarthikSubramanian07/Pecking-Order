/**
 * IndexedDB persistence. Three object stores:
 *   boards  — Board JSON keyed by board id
 *   images  — processed image Blobs keyed by SHA-256 hash (content-addressed,
 *             so the same picture used on five boards is stored once)
 *   meta    — small key/value settings (last opened board, preferences)
 *
 * localStorage is never used for images: it is synchronous, string-only and
 * capped at ~5 MB, which is the #1 way tier-list apps lose people's work.
 */
import { type DBSchema, type IDBPDatabase, openDB } from 'idb'
import { referencedImages, summarize } from '@/core/board'
import type { Board, BoardSummary, ImageHash } from '@/core/types'
import { parseBoard } from '@/core/validate'

export interface StoredImage {
  hash: ImageHash
  blob: Blob
  width: number
  height: number
  createdAt: number
}

interface PeckDB extends DBSchema {
  boards: { key: string; value: Board }
  images: { key: ImageHash; value: StoredImage }
  meta: { key: string; value: unknown }
}

const DB_NAME = 'pecking-order'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<PeckDB>> | null = null

export function db(): Promise<IDBPDatabase<PeckDB>> {
  dbPromise ??= openDB<PeckDB>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      database.createObjectStore('boards', { keyPath: 'id' })
      database.createObjectStore('images', { keyPath: 'hash' })
      database.createObjectStore('meta')
    },
    blocking() {
      // Another tab wants to upgrade: step aside so it can.
      void dbPromise?.then((d) => d.close())
      dbPromise = null
    },
  })
  return dbPromise
}

/** Test hook: close and forget the cached connection. */
export async function resetDbForTests(): Promise<void> {
  const open = dbPromise
  dbPromise = null
  if (open) (await open).close()
}

// ─── Boards ───────────────────────────────────────────────────────────────

export async function listBoards(): Promise<BoardSummary[]> {
  const all = await (await db()).getAll('boards')
  return all.map(summarize).sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getBoard(id: string): Promise<Board | undefined> {
  const raw = await (await db()).get('boards', id)
  if (!raw) return undefined
  try {
    return parseBoard(raw)
  } catch (err) {
    console.error('Stored board failed validation', err)
    return undefined
  }
}

export async function putBoard(board: Board): Promise<void> {
  await (await db()).put('boards', board)
}

export async function deleteBoard(id: string): Promise<void> {
  await (await db()).delete('boards', id)
}

// ─── Images ───────────────────────────────────────────────────────────────

export async function putImage(image: StoredImage): Promise<void> {
  const d = await db()
  if (!(await d.getKey('images', image.hash))) await d.put('images', image)
}

export async function getImage(hash: ImageHash): Promise<StoredImage | undefined> {
  return (await db()).get('images', hash)
}

/**
 * Deletes images no board references. `extraKeep` protects images that are
 * referenced only by unsaved in-memory state (e.g. the undo stack).
 */
export async function collectGarbage(extraKeep: Iterable<ImageHash> = []): Promise<number> {
  const d = await db()
  const keep = new Set(extraKeep)
  for (const board of await d.getAll('boards')) {
    for (const h of referencedImages(board)) keep.add(h)
  }
  const tx = d.transaction('images', 'readwrite')
  let removed = 0
  for (const key of await tx.store.getAllKeys()) {
    if (!keep.has(key)) {
      await tx.store.delete(key)
      removed++
    }
  }
  await tx.done
  return removed
}

// ─── Meta ─────────────────────────────────────────────────────────────────

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get('meta', key)) as T | undefined
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await db()).put('meta', value, key)
}

/**
 * Asks the browser not to evict our data under storage pressure.
 * Safari otherwise deletes script-written storage after 7 days without a visit.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.()
    return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null
  } catch {
    return null
  }
}
