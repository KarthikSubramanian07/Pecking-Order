/**
 * Every way an image gets into Pecking Order ends here: it is processed,
 * stored content-addressed in IndexedDB, primed in the URL cache and handed
 * back as a NewItem ready for `opAddItems`.
 */
import type { NewItem } from '@/core/board'
import type { ImageCredit, ImageHash } from '@/core/types'
import { parseCredit } from '@/core/validate'
import { putImage } from '@/storage/db'
import { primeImageUrl } from './cache'
import { isHiddenName, labelFromFileName, labelFromUrl } from './labels'
import { mapPool } from './pool'
import { processImage } from './process'
import {
  type Draft,
  draftsFromStrings,
  filesInDirectories,
  MAX_TEXT_LINES,
  snapshotDataTransfer,
  type TransferSnapshot,
} from './transfer'
import { fetchImageBlob, parseImageUrl } from './urls'

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

/** Images processed at once: enough to overlap network and decode, few enough to bound memory. */
const CONCURRENCY = 4
export const MAX_BATCH = 500

const IMAGE_FILE = /\.(avif|bmp|gif|heic|heif|ico|jpe?g|jfif|png|svg|tiff?|webp)$/i

/**
 * One unit of work. Text cards have no `load`; images resolve to a Blob that
 * is processed and stored.
 */
interface Job {
  name: string
  label: string
  credit?: ImageCredit
  load?: (signal?: AbortSignal) => Promise<Blob>
}

/** Files from <input type=file> (incl. webkitdirectory). Non-images are skipped. */
export async function ingestFiles(
  files: Iterable<File>,
  opts?: IngestOptions,
): Promise<IngestResult> {
  const provider = opts?.provider ?? 'upload'
  return runJobs(
    Array.from(files)
      .filter(isLikelyImage)
      .map((f) => fileJob(f, provider)),
    opts,
  )
}

/**
 * Drop / paste payloads: files, whole folders, image URLs, <img> HTML from
 * other sites, and plain text (one text item per line).
 * IMPORTANT: must read `dt.items` synchronously before the first await.
 */
export function ingestDataTransfer(dt: DataTransfer, opts?: IngestOptions): Promise<IngestResult> {
  return ingestSnapshot(snapshotDataTransfer(dt), opts)
}

/**
 * Fetches a remote (CORS-enabled) image, processes and stores it.
 * `data:image/*` URLs from pastes are accepted too.
 */
export async function ingestUrl(
  url: string,
  credit?: ImageCredit,
  label?: string,
  opts?: { signal?: AbortSignal },
): Promise<NewItem> {
  const parsed = parseImageUrl(url)
  const image = await store(await fetchImageBlob(parsed, opts?.signal))
  return {
    label: label ?? labelFromUrl(parsed),
    image,
    // Search APIs and pack resolvers supply these: re-check before they become a link.
    credit: (credit && parseCredit(credit)) || creditForUrl(parsed, 'paste'),
  }
}

async function ingestSnapshot(snap: TransferSnapshot, opts?: IngestOptions): Promise<IngestResult> {
  // Files win over strings: browsers attach a URL and HTML to most file drags.
  if (snap.files.length || snap.directories.length) {
    const files = [...snap.files, ...(await filesInDirectories(snap.directories))]
    return ingestFiles(files, opts)
  }
  const { drafts, truncated } = draftsFromStrings(snap)
  const failed: IngestFailure[] = truncated
    ? [{ name: 'Pasted text', reason: `Only the first ${MAX_TEXT_LINES} lines were added.` }]
    : []
  return runJobs(
    drafts.map((d) => draftJob(d, opts?.provider ?? 'paste')),
    opts,
    failed,
  )
}

// ─── Jobs ─────────────────────────────────────────────────────────────────

function isLikelyImage(file: File): boolean {
  if (isHiddenName(file.name)) return false
  if (file.type) return file.type.startsWith('image/')
  return IMAGE_FILE.test(file.name)
}

function fileJob(file: File, provider: ImageCredit['provider']): Job {
  return {
    name: file.name,
    label: labelFromFileName(file.name),
    credit: { provider },
    load: async () => file,
  }
}

function draftJob(draft: Draft, dataProvider: ImageCredit['provider']): Job {
  if (draft.kind === 'text') return { name: draft.label, label: draft.label }
  const { url } = draft
  return {
    name: url.protocol === 'data:' ? 'Pasted image' : url.href,
    label: draft.label ?? labelFromUrl(url),
    credit: creditForUrl(url, dataProvider),
    load: (signal) => fetchImageBlob(url, signal),
  }
}

/** Remote images keep a link back; inline data has nowhere to point. */
function creditForUrl(url: URL, dataProvider: ImageCredit['provider']): ImageCredit {
  return url.protocol === 'data:'
    ? { provider: dataProvider }
    : { provider: 'url', sourceUrl: url.href }
}

async function store(blob: Blob): Promise<ImageHash> {
  const image = await processImage(blob)
  await putImage(image)
  primeImageUrl(image.hash, image.blob)
  return image.hash
}

/**
 * Runs jobs with bounded concurrency, keeps input order, and collapses
 * identical images (same output hash) into the first item that produced them.
 */
async function runJobs(
  all: Job[],
  opts: IngestOptions | undefined,
  failed: IngestFailure[] = [],
): Promise<IngestResult> {
  const signal = opts?.signal
  signal?.throwIfAborted()
  const jobs: Job[] = []
  let images = 0
  for (const job of all) {
    if (job.load && ++images > MAX_BATCH) {
      failed.push({ name: job.name, reason: `Only ${MAX_BATCH} images can be added at once.` })
    } else {
      jobs.push(job)
    }
  }

  let done = 0
  opts?.onProgress?.(0, jobs.length)
  const settled = await mapPool(
    jobs,
    CONCURRENCY,
    async (job) => {
      try {
        return job.load ? await store(await job.load(signal)) : null
      } finally {
        opts?.onProgress?.(++done, jobs.length)
      }
    },
    signal,
  )
  signal?.throwIfAborted()

  const items: NewItem[] = []
  const seen = new Set<ImageHash>()
  settled.forEach((result, i) => {
    const job = jobs[i]
    if (!job) return
    if (result.status === 'rejected') {
      failed.push({ name: job.name, reason: reasonOf(result.reason) })
      return
    }
    const hash = result.value
    if (hash === null) {
      items.push({ label: job.label })
      return
    }
    if (seen.has(hash)) return
    seen.add(hash)
    items.push({ label: job.label, image: hash, ...(job.credit && { credit: job.credit }) })
  })
  return { items, failed }
}

function reasonOf(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Something went wrong with that image.'
}
