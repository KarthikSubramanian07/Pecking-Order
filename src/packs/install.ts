import { createBoard, type NewItem, opAddItems } from '@/core/board'
import { DEFAULT_PRESET, type TierPreset } from '@/core/presets'
import type { Board } from '@/core/types'
import { ingestUrl } from '@/images/ingest'
import catalog from './generated/catalog.json'
import { mapWithConcurrency } from './pool'
import { resolvePackImage } from './resolve'
import { PACK_ID_RE, parsePack } from './spec'
import type { PackItemSpec, PackSpec, PackSummary } from './types'

export interface InstallProgress {
  done: number
  total: number
}

/** Enough to keep the connection busy without tripping Wikimedia's rate limits. */
const IMAGE_CONCURRENCY = 6

const CATALOG: readonly PackSummary[] = catalog

export async function listPacks(): Promise<PackSummary[]> {
  return [...CATALOG]
}

/**
 * Builds a fresh board from a pack, fetching and storing every image.
 * Items whose image can't be resolved or downloaded become text tiles, so a
 * flaky network or a renamed article never sinks the whole pack. Only an
 * abort (or an unreachable/invalid pack file) rejects.
 */
export async function boardFromPack(
  packId: string,
  opts: { onProgress?: (p: InstallProgress) => void; signal?: AbortSignal } = {},
): Promise<Board> {
  const { onProgress, signal } = opts
  const pack = await fetchPack(packId, signal)

  const board = createBoard({ title: pack.title, preset: presetFor(pack) })
  const total = pack.items.length
  let done = 0
  onProgress?.({ done, total })

  const items = await mapWithConcurrency(pack.items, IMAGE_CONCURRENCY, async (spec) => {
    const item = await itemFromSpec(spec, signal)
    done++
    onProgress?.({ done, total })
    return item
  })
  signal?.throwIfAborted()

  opAddItems(board, items)
  board.pack = { id: pack.id, version: pack.version }
  return board
}

async function fetchPack(packId: string, signal: AbortSignal | undefined): Promise<PackSpec> {
  if (!PACK_ID_RE.test(packId)) throw new Error(`Unknown pack "${packId}"`)
  const res = await fetch(`${import.meta.env.BASE_URL}packs/${packId}.json`, { signal })
  if (!res.ok) throw new Error(`Couldn't load pack "${packId}" (HTTP ${res.status})`)
  return parsePack(await res.json())
}

function presetFor(pack: PackSpec): TierPreset {
  return pack.tiers
    ? { id: `pack:${pack.id}`, name: pack.title, labels: pack.tiers }
    : DEFAULT_PRESET
}

async function itemFromSpec(spec: PackItemSpec, signal: AbortSignal | undefined): Promise<NewItem> {
  const textTile: NewItem = { label: spec.label, packItemId: spec.id }
  try {
    const resolved = await resolvePackImage(spec, signal)
    if (!resolved) return textTile
    const ingested = await ingestUrl(resolved.url, resolved.credit, spec.label)
    return { ...ingested, label: spec.label, packItemId: spec.id }
  } catch (err) {
    if (signal?.aborted) throw err
    return textTile
  }
}
