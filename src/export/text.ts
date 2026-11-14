/**
 * Text wrapping and fitting against an injected `measure` so layout stays pure
 * (no canvas) and can be unit-tested with a fake metric.
 */

/** Returns the advance width of `text` set in CSS `font`. */
export type Measure = (text: string, font: string) => number

const ELLIPSIS = '…'

/** Shortens `text` with a trailing ellipsis until it fits `maxWidth`. */
export function ellipsize(text: string, maxWidth: number, font: string, measure: Measure): string {
  if (measure(text, font) <= maxWidth) return text
  let lo = 0
  let hi = text.length
  // Binary search the longest prefix that still fits with the ellipsis.
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (measure(text.slice(0, mid).trimEnd() + ELLIPSIS, font) <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return lo === 0 ? ELLIPSIS : text.slice(0, lo).trimEnd() + ELLIPSIS
}

export interface Wrapped {
  lines: string[]
  /** True when text was cut (ellipsis added) or a word had to be split. */
  clipped: boolean
}

/**
 * Greedy word wrap. Words wider than the line are split by character only when
 * `breakWords` is set; otherwise wrapping reports `clipped` so the caller can
 * try a smaller size first.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  font: string,
  measure: Measure,
  maxLines: number,
  breakWords = true,
): Wrapped {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let clipped = false
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (measure(candidate, font) <= maxWidth) {
      line = candidate
      continue
    }
    if (line) lines.push(line)
    line = word
    if (measure(word, font) > maxWidth) {
      clipped = true
      if (!breakWords) continue
      while (line.length > 1 && measure(line, font) > maxWidth) {
        const cut = longestFittingPrefix(line, maxWidth, font, measure)
        lines.push(line.slice(0, cut))
        line = line.slice(cut)
      }
    }
  }
  if (line) lines.push(line)
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    const last = kept.length - 1
    kept[last] = ellipsize(`${kept[last]}${ELLIPSIS}`, maxWidth, font, measure)
    return { lines: kept, clipped: true }
  }
  return { lines, clipped }
}

function longestFittingPrefix(word: string, maxWidth: number, font: string, measure: Measure) {
  let n = 1
  while (n < word.length && measure(word.slice(0, n + 1), font) <= maxWidth) n++
  return n
}

export interface FitRequest {
  text: string
  maxWidth: number
  maxHeight: number
  maxLines: number
  /** Largest and smallest font size to try. */
  maxSize: number
  minSize: number
  /** Font string for a given size. */
  font: (size: number) => string
  /** Line height as a multiple of font size. */
  leading: number
  measure: Measure
}

export interface FittedText {
  lines: string[]
  size: number
  font: string
  lineHeight: number
  /** True when the fallback (ellipsis / broken words at min size) was used. */
  clipped: boolean
}

/**
 * Picks the largest size at which `text` wraps into the box without clipping.
 * Falls back to the minimum size with ellipsis/character breaks.
 */
export function fitText(req: FitRequest): FittedText {
  const step = Math.max(0.5, (req.maxSize - req.minSize) / 24)
  for (let size = req.maxSize; size >= req.minSize; size -= step) {
    const attempt = tryFit(req, size)
    if (attempt) return attempt
  }
  const size = req.minSize
  const f = req.font(size)
  const lineHeight = size * req.leading
  const maxLines = Math.max(1, Math.min(req.maxLines, Math.floor(req.maxHeight / lineHeight)))
  const { lines } = wrapText(req.text, req.maxWidth, f, req.measure, maxLines, true)
  return { lines, size, font: f, lineHeight, clipped: true }
}

function tryFit(req: FitRequest, size: number): FittedText | null {
  const f = req.font(size)
  const lineHeight = size * req.leading
  const { lines, clipped } = wrapText(req.text, req.maxWidth, f, req.measure, req.maxLines, false)
  if (clipped || lines.length * lineHeight > req.maxHeight) return null
  return { lines, size, font: f, lineHeight, clipped: false }
}
