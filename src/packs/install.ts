// CONTRACT STUB — implemented by the packs workstream.
import type { Board } from '@/core/types'
import type { PackSummary } from './types'

export interface InstallProgress {
  done: number
  total: number
}

export async function listPacks(): Promise<PackSummary[]> {
  return []
}

/** Builds a fresh board from a pack, fetching and storing every image. */
export async function boardFromPack(
  _packId: string,
  _opts?: { onProgress?: (p: InstallProgress) => void; signal?: AbortSignal },
): Promise<Board> {
  throw new Error('not implemented')
}
