// CONTRACT STUB — implemented by the images workstream. Keep signatures stable.
import type { NewItem } from '@/core/board'
import type { ImageCredit } from '@/core/types'

export interface IngestFailure {
  name: string
  reason: string
}

export interface IngestResult {
  items: NewItem[]
  failed: IngestFailure[]
}

export interface IngestOptions {
  provider?: ImageCredit['provider']
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
}

/** Files from <input type=file> (incl. webkitdirectory). Non-images are skipped. */
export async function ingestFiles(
  _files: Iterable<File>,
  _opts?: IngestOptions,
): Promise<IngestResult> {
  throw new Error('not implemented')
}

/**
 * Drop / paste payloads: files, whole folders, image URLs, <img> HTML from
 * other sites, and plain text (one text item per line).
 * IMPORTANT: must read `dt.items` synchronously before the first await.
 */
export function ingestDataTransfer(
  _dt: DataTransfer,
  _opts?: IngestOptions,
): Promise<IngestResult> {
  throw new Error('not implemented')
}

/** Fetches a remote (CORS-enabled) image, processes and stores it. */
export async function ingestUrl(
  _url: string,
  _credit?: ImageCredit,
  _label?: string,
): Promise<NewItem> {
  throw new Error('not implemented')
}
