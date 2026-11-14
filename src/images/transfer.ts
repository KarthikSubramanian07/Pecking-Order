/**
 * Reading drop and paste payloads. A DataTransfer is only readable during the
 * event that produced it, so `snapshotDataTransfer` copies out everything we
 * might need synchronously; the rest of the work runs on that snapshot.
 */
import { cleanText, isHiddenName } from './labels'
import { isImageishUrl, tryParseImageUrl } from './urls'

export const MAX_TEXT_LINES = 200
/** Sanity bound on a folder walk, so dropping a whole drive can't hang the tab. */
const MAX_WALKED_FILES = 5000

export interface TransferSnapshot {
  files: File[]
  directories: FileSystemDirectoryEntry[]
  uriList: string
  html: string
  text: string
}

/** What a drop asks us to add, in the order it arrived. */
export type Draft = { kind: 'url'; url: URL; label?: string } | { kind: 'text'; label: string }

export function snapshotDataTransfer(dt: DataTransfer): TransferSnapshot {
  const files: File[] = []
  const directories: FileSystemDirectoryEntry[] = []
  const items = dt.items
  for (let i = 0; i < (items?.length ?? 0); i++) {
    const item = items[i]
    if (item?.kind !== 'file') continue
    const entry = item.webkitGetAsEntry?.()
    if (entry?.isDirectory) {
      directories.push(entry as FileSystemDirectoryEntry)
      continue
    }
    const file = item.getAsFile()
    if (file) files.push(file)
  }
  // Older engines expose files only through `dt.files`.
  if (!files.length && !directories.length) files.push(...Array.from(dt.files ?? []))
  return {
    files,
    directories,
    uriList: readString(dt, 'text/uri-list'),
    html: readString(dt, 'text/html'),
    text: readString(dt, 'text/plain'),
  }
}

function readString(dt: DataTransfer, type: string): string {
  try {
    return dt.getData(type)
  } catch {
    return ''
  }
}

// ─── Folders ──────────────────────────────────────────────────────────────

/** Every non-hidden file under the given directories, depth first. */
export async function filesInDirectories(dirs: FileSystemDirectoryEntry[]): Promise<File[]> {
  const out: File[] = []
  for (const dir of dirs) await walk(dir, out)
  return out
}

async function walk(entry: FileSystemEntry, out: File[]): Promise<void> {
  if (out.length >= MAX_WALKED_FILES || isHiddenName(entry.name)) return
  try {
    if (entry.isFile) {
      out.push(await fileOf(entry as FileSystemFileEntry))
      return
    }
    for (const child of await readAllEntries(entry as FileSystemDirectoryEntry)) {
      await walk(child, out)
    }
  } catch {
    // An unreadable file or subfolder (permissions, vanished) shouldn't sink the drop.
  }
}

/** `readEntries` returns ~100 entries per call; keep calling until it returns none. */
async function readAllEntries(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = dir.createReader()
  const all: FileSystemEntry[] = []
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    )
    if (!batch.length) return all
    all.push(...batch)
  }
}

function fileOf(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}

// ─── Text payloads ────────────────────────────────────────────────────────

/**
 * Turns the string parts of a drop into drafts. The richest format wins:
 * HTML (it carries alt text for labels), then a URI list, then plain text.
 */
export function draftsFromStrings(snapshot: TransferSnapshot): {
  drafts: Draft[]
  truncated: boolean
} {
  const fromHtml = snapshot.html ? imagesFromHtml(snapshot.html) : []
  if (fromHtml.length) return { drafts: fromHtml, truncated: false }
  const fromUris = urlsFromUriList(snapshot.uriList)
  if (fromUris.length) return { drafts: fromUris, truncated: false }
  return draftsFromText(snapshot.text)
}

/**
 * `<img>` sources from copied HTML. DOMParser documents are inert: scripts
 * don't run and images don't load, and nothing is attached to our document.
 */
export function imagesFromHtml(html: string): Draft[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const base = doc.querySelector('base[href]')?.getAttribute('href') ?? undefined
  const seen = new Set<string>()
  const drafts: Draft[] = []
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    const src = img.getAttribute('src')
    if (!src) continue
    let absolute: string
    try {
      absolute = new URL(src, base).href
    } catch {
      continue
    }
    const url = tryParseImageUrl(absolute)
    if (!url || seen.has(url.href)) continue
    seen.add(url.href)
    const label = cleanText(img.getAttribute('alt') || img.getAttribute('title') || '')
    drafts.push(label ? { kind: 'url', url, label } : { kind: 'url', url })
  }
  return drafts
}

export function urlsFromUriList(uriList: string): Draft[] {
  const drafts: Draft[] = []
  for (const line of uriList.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const url = tryParseImageUrl(trimmed)
    if (url) drafts.push({ kind: 'url', url })
  }
  return drafts
}

/** One draft per non-empty line: image links are fetched, anything else is a text card. */
export function draftsFromText(text: string): { drafts: Draft[]; truncated: boolean } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const drafts: Draft[] = []
  for (const line of lines.slice(0, MAX_TEXT_LINES)) {
    const url = isImageishUrl(line) ? tryParseImageUrl(line) : null
    if (url) drafts.push({ kind: 'url', url })
    else drafts.push({ kind: 'text', label: cleanText(line) })
  }
  return { drafts, truncated: lines.length > MAX_TEXT_LINES }
}
