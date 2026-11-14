/**
 * Turns the names things arrive with (file names, URLs, alt text) into card
 * labels a person would actually type.
 */
import { clampText, MAX_LABEL } from '@/core/board'

const FALLBACK_LABEL = 'Untitled'
const EXTENSION = /\.[a-z0-9]{1,5}$/i

/** Collapses whitespace and caps length. Used for alt text and pasted lines. */
export function cleanText(raw: string): string {
  return clampText(raw, MAX_LABEL)
}

/** "tom_hanks--2016.JPG" → "tom hanks 2016". Separators become spaces. */
export function labelFromFileName(name: string): string {
  const base = name.replace(EXTENSION, '').replace(/[_-]+/g, ' ')
  return cleanText(base) || FALLBACK_LABEL
}

/** Label for an image that only has a URL to go on: its file name, else its host. */
export function labelFromUrl(url: URL): string {
  if (url.protocol === 'data:') return 'Pasted image'
  const segment = url.pathname.split('/').filter(Boolean).pop() ?? ''
  let decoded = segment
  try {
    decoded = decodeURIComponent(segment)
  } catch {
    // Malformed escapes: the raw segment is still a reasonable label.
  }
  const label = labelFromFileName(decoded)
  return label === FALLBACK_LABEL ? url.hostname || FALLBACK_LABEL : label
}

/** macOS/Windows junk that rides along with folder drops. */
export function isHiddenName(name: string): boolean {
  return name.startsWith('.') || name === '__MACOSX' || name === 'Thumbs.db'
}
