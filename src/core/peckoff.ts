/**
 * Peck-off: rank items by answering "which is better?" for pairs.
 *
 * Binary-insertion sort as an immutable state machine. Each pending item is
 * inserted into the ranked list by bisection, so n items need about
 * log2(n!) ≈ n·log2(n) − 1.44n questions, 20 items take ~60 picks, not 190.
 */
import type { ItemId } from './types'

export interface PeckoffState {
  /** Best first. */
  ranked: ItemId[]
  pending: ItemId[]
  /** Item being placed, and the bisection window inside `ranked`. */
  current: ItemId | null
  lo: number
  hi: number
  answered: number
}

export type Pick = 'current' | 'other' | 'tie'

export function startPeckoff(items: ItemId[], random: () => number = Math.random): PeckoffState {
  // Shuffle so the starting order doesn't bias the result.
  const pool = [...items]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j] as ItemId, pool[i] as ItemId]
  }
  const [first, ...rest] = pool
  return advance({
    ranked: first ? [first] : [],
    pending: rest,
    current: null,
    lo: 0,
    hi: 0,
    answered: 0,
  })
}

/** Pulls the next pending item into play once the current one is placed. */
function advance(s: PeckoffState): PeckoffState {
  if (s.current !== null || s.pending.length === 0) return s
  const [current, ...pending] = s.pending
  return { ...s, current: current ?? null, pending, lo: 0, hi: s.ranked.length }
}

/** The pair to show, or null when finished. `current` is always the newcomer. */
export function question(s: PeckoffState): { current: ItemId; other: ItemId } | null {
  if (s.current === null) return null
  const other = s.ranked[mid(s)]
  return other === undefined ? null : { current: s.current, other }
}

const mid = (s: PeckoffState) => Math.floor((s.lo + s.hi) / 2)

export function answer(s: PeckoffState, pick: Pick): PeckoffState {
  if (s.current === null) return s
  const m = mid(s)
  let { lo, hi } = s
  if (pick === 'current') hi = m
  else if (pick === 'other') lo = m + 1
  else lo = hi = m + 1 // tie: place right after its equal
  const next = { ...s, lo, hi, answered: s.answered + 1 }
  if (lo < hi) return next
  const ranked = [...s.ranked]
  ranked.splice(lo, 0, s.current)
  return advance({ ...next, ranked, current: null })
}

export const isDone = (s: PeckoffState): boolean => s.current === null && s.pending.length === 0

/** Rough questions remaining, for the progress bar. */
export function estimateRemaining(s: PeckoffState): number {
  let n = s.ranked.length
  let left = s.current !== null ? Math.ceil(Math.log2(s.hi - s.lo + 1)) : 0
  if (s.current !== null) n++
  for (let i = 0; i < s.pending.length; i++) left += Math.ceil(Math.log2(n + i + 1))
  return left
}

/**
 * Splits a ranking across `tierCount` tiers as evenly as possible, giving any
 * remainder to the middle tiers (nobody wants a crowded top tier).
 */
export function distribute<T>(ranked: T[], tierCount: number): T[][] {
  const k = Math.max(1, tierCount)
  const base = Math.floor(ranked.length / k)
  let extra = ranked.length % k
  const sizes = Array.from({ length: k }, () => base)
  const order = Array.from({ length: k }, (_, i) => i).sort(
    (a, b) => Math.abs(a - (k - 1) / 2) - Math.abs(b - (k - 1) / 2),
  )
  for (const i of order) {
    if (!extra) break
    sizes[i] = (sizes[i] ?? 0) + 1
    extra--
  }
  const out: T[][] = []
  let at = 0
  for (const size of sizes) {
    out.push(ranked.slice(at, at + size))
    at += size
  }
  return out
}
