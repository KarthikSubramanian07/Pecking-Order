/**
 * Shared fixtures for export tests. Kept out of production code paths: only
 * `*.test.ts` files import it.
 */
import { swatchAt } from '@/core/palette'
import { type Board, COOP, type Item } from '@/core/types'
import { DEFAULT_EXPORT, type ExportOptions } from '@/export/render'
import type { Measure } from '@/export/text'

/** Deterministic metric: every glyph is 0.55em wide. */
export const fakeMeasure: Measure = (text, font) => {
  const size = Number(/([\d.]+)px/.exec(font)?.[1] ?? 16)
  return [...text].length * size * 0.55
}

export interface BoardSpec {
  title?: string
  /** Item count per tier, or explicit labels. */
  tiers: (number | string[])[]
  tierLabels?: string[]
  coop?: number
  /** Every n-th item is text-only (0 = all images). */
  textEvery?: number
}

export function makeBoard(spec: BoardSpec): Board {
  let n = 0
  const items: Record<string, Item> = {}
  const add = (label: string) => {
    const id = `i${n}`
    const textOnly = spec.textEvery ? n % spec.textEvery === 0 : false
    items[id] = textOnly ? { id, label } : { id, label, image: `hash-${n}` }
    n++
    return id
  }
  const placement: Record<string, string[]> = {}
  const tiers = spec.tiers.map((t, i) => {
    const id = `t${i}`
    const labels = typeof t === 'number' ? Array.from({ length: t }, (_, j) => `Item ${i}.${j}`) : t
    placement[id] = labels.map(add)
    return { id, label: spec.tierLabels?.[i] ?? 'SABCDEFGH'[i] ?? `T${i}`, color: swatchAt(i) }
  })
  placement[COOP] = Array.from({ length: spec.coop ?? 0 }, (_, j) => add(`Loose ${j}`))
  return {
    v: 1,
    id: 'b-test',
    title: spec.title ?? 'Snacks, ranked',
    tiers,
    items,
    placement,
    createdAt: 0,
    // Mid-month so the formatted month is the same in every timezone.
    updatedAt: Date.UTC(2026, 10, 14, 12),
  }
}

export function options(over: Partial<ExportOptions> = {}): ExportOptions {
  return { ...DEFAULT_EXPORT, ...over }
}
