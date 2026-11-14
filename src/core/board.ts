/**
 * Board operations.
 *
 * Every `op*` function mutates the board it is given. They are written to run
 * inside an Immer `produce` (see `state/boardStore.ts`), which turns them into
 * cheap structurally-shared immutable updates. Tests call them the same way.
 */
import { newId } from './ids'
import { swatchAt } from './palette'
import { DEFAULT_PRESET, type TierPreset, tiersFromPreset } from './presets'
import {
  type Board,
  type BoardSummary,
  COOP,
  type ContainerId,
  type Item,
  type ItemId,
  type Tier,
  type TierId,
} from './types'

export const MAX_TIERS = 20
export const MAX_LABEL = 80
export const MAX_TITLE = 120

export function createBoard(opts: { title?: string; preset?: TierPreset } = {}): Board {
  const tiers = tiersFromPreset(opts.preset ?? DEFAULT_PRESET)
  const now = Date.now()
  return {
    v: 1,
    id: newId('b'),
    title: clampText(opts.title ?? 'Untitled pecking order', MAX_TITLE),
    tiers,
    items: {},
    placement: { [COOP]: [], ...Object.fromEntries(tiers.map((t) => [t.id, []])) },
    createdAt: now,
    updatedAt: now,
  }
}

export function clampText(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/** Containers in visual order: tiers top→bottom, then the coop. */
export function containerOrder(board: Board): ContainerId[] {
  return [...board.tiers.map((t) => t.id), COOP]
}

export function findContainer(board: Board, itemId: ItemId): ContainerId | undefined {
  for (const [cid, ids] of Object.entries(board.placement)) {
    if (ids.includes(itemId)) return cid
  }
  return undefined
}

export function tierIndex(board: Board, tierId: TierId): number {
  return board.tiers.findIndex((t) => t.id === tierId)
}

// ─── Items ────────────────────────────────────────────────────────────────

export type NewItem = Omit<Item, 'id'> & { id?: ItemId }

/** Adds items to the end of a container (the coop by default). Returns their ids. */
export function opAddItems(board: Board, items: NewItem[], to: ContainerId = COOP): ItemId[] {
  const target = board.placement[to] ?? board.placement[COOP]
  if (!target) throw new Error('board has no coop')
  const ids: ItemId[] = []
  for (const draft of items) {
    const id = draft.id && !board.items[draft.id] ? draft.id : newId('i')
    board.items[id] = { ...draft, id, label: clampText(draft.label, MAX_LABEL) }
    target.push(id)
    ids.push(id)
  }
  touch(board)
  return ids
}

export function opRemoveItems(board: Board, ids: ItemId[]): void {
  const doomed = new Set(ids)
  for (const cid of Object.keys(board.placement)) {
    board.placement[cid] = (board.placement[cid] ?? []).filter((id) => !doomed.has(id))
  }
  for (const id of doomed) delete board.items[id]
  touch(board)
}

export function opUpdateItem(board: Board, id: ItemId, patch: Partial<Omit<Item, 'id'>>): void {
  const item = board.items[id]
  if (!item) return
  Object.assign(item, patch)
  if (patch.label !== undefined) item.label = clampText(patch.label, MAX_LABEL)
  touch(board)
}

/**
 * Moves an item to `index` within `to`. `index` is clamped; omit it to append.
 * Moving within the same container behaves like array reordering.
 */
export function opMoveItem(board: Board, itemId: ItemId, to: ContainerId, index?: number): void {
  const from = findContainer(board, itemId)
  const target = board.placement[to]
  if (from === undefined || !target) return
  const source = board.placement[from] as ItemId[]
  const fromIndex = source.indexOf(itemId)
  source.splice(fromIndex, 1)
  const at = index === undefined ? target.length : Math.max(0, Math.min(index, target.length))
  target.splice(at, 0, itemId)
  touch(board)
}

/** Moves every item back to the coop, keeping tier order then coop order. */
export function opResetPlacement(board: Board): void {
  const all = containerOrder(board).flatMap((cid) => board.placement[cid] ?? [])
  for (const t of board.tiers) board.placement[t.id] = []
  board.placement[COOP] = all
  touch(board)
}

/** Fisher–Yates shuffle of the coop. `random` is injectable for tests. */
export function opShuffleCoop(board: Board, random: () => number = Math.random): void {
  const coop = board.placement[COOP] as ItemId[]
  for (let i = coop.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[coop[i], coop[j]] = [coop[j] as ItemId, coop[i] as ItemId]
  }
  touch(board)
}

export function opSortContainer(board: Board, cid: ContainerId): void {
  const list = board.placement[cid]
  if (!list) return
  list.sort((a, b) =>
    (board.items[a]?.label ?? '').localeCompare(board.items[b]?.label ?? '', undefined, {
      numeric: true,
      sensitivity: 'base',
    }),
  )
  touch(board)
}

// ─── Tiers ────────────────────────────────────────────────────────────────

export function opAddTier(board: Board, at = board.tiers.length, label?: string): TierId | null {
  if (board.tiers.length >= MAX_TIERS) return null
  const tier: Tier = {
    id: newId('t'),
    label: clampText(label ?? nextTierLabel(board), MAX_LABEL),
    color: swatchAt(board.tiers.length),
  }
  board.tiers.splice(Math.max(0, Math.min(at, board.tiers.length)), 0, tier)
  board.placement[tier.id] = []
  touch(board)
  return tier.id
}

/** Removes a tier; its items fall back into the front of the coop. */
export function opRemoveTier(board: Board, tierId: TierId): void {
  const idx = tierIndex(board, tierId)
  if (idx === -1) return
  const orphans = board.placement[tierId] ?? []
  board.tiers.splice(idx, 1)
  delete board.placement[tierId]
  board.placement[COOP] = [...orphans, ...(board.placement[COOP] ?? [])]
  touch(board)
}

export function opUpdateTier(board: Board, tierId: TierId, patch: Partial<Omit<Tier, 'id'>>): void {
  const tier = board.tiers.find((t) => t.id === tierId)
  if (!tier) return
  if (patch.label !== undefined) tier.label = clampText(patch.label, MAX_LABEL) || tier.label
  if (patch.color !== undefined) tier.color = patch.color
  touch(board)
}

export function opMoveTier(board: Board, tierId: TierId, toIndex: number): void {
  const from = tierIndex(board, tierId)
  if (from === -1) return
  const [tier] = board.tiers.splice(from, 1)
  board.tiers.splice(Math.max(0, Math.min(toIndex, board.tiers.length)), 0, tier as Tier)
  touch(board)
}

/** Clears a tier's items back into the coop. */
export function opClearTier(board: Board, tierId: TierId): void {
  const items = board.placement[tierId]
  if (!items?.length) return
  board.placement[COOP] = [...items, ...(board.placement[COOP] ?? [])]
  board.placement[tierId] = []
  touch(board)
}

export function opSetTitle(board: Board, title: string): void {
  board.title = clampText(title, MAX_TITLE) || 'Untitled pecking order'
  touch(board)
}

function nextTierLabel(board: Board): string {
  const used = new Set(board.tiers.map((t) => t.label.toUpperCase()))
  for (const c of 'SABCDEFGHIJKLMNOPQRTUVWXYZ') if (!used.has(c)) return c
  return `Tier ${board.tiers.length + 1}`
}

function touch(board: Board): void {
  board.updatedAt = Date.now()
}

// ─── Derived ──────────────────────────────────────────────────────────────

export function summarize(board: Board): BoardSummary {
  const itemCount = Object.keys(board.items).length
  const coopCount = board.placement[COOP]?.length ?? 0
  const preview = containerOrder(board)
    .flatMap((cid) => board.placement[cid] ?? [])
    .map((id) => board.items[id]?.image)
    .filter((h): h is string => Boolean(h))
    .slice(0, 4)
  return {
    id: board.id,
    title: board.title,
    itemCount,
    rankedCount: itemCount - coopCount,
    updatedAt: board.updatedAt,
    preview,
  }
}

/** Every image hash referenced by a board, used for garbage collection. */
export function referencedImages(board: Board): Set<string> {
  const out = new Set<string>()
  for (const item of Object.values(board.items)) if (item.image) out.add(item.image)
  return out
}

/** Deep-copies a board with fresh ids (for "duplicate"). */
export function cloneBoard(board: Board, title = `${board.title} (copy)`): Board {
  const copy = structuredClone(board)
  const now = Date.now()
  return {
    ...copy,
    id: newId('b'),
    title: clampText(title, MAX_TITLE),
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Checks the board's structural invariants. Used after loading untrusted data
 * (imports, share links), throws a descriptive error if anything is off.
 */
export function assertValidBoard(board: Board): void {
  const fail = (msg: string): never => {
    throw new Error(`Invalid board: ${msg}`)
  }
  if (board.v !== 1) fail(`unsupported version ${String(board.v)}`)
  if (!Array.isArray(board.placement[COOP])) fail('missing coop')
  const seen = new Set<string>()
  for (const cid of containerOrder(board)) {
    const list = board.placement[cid]
    if (!Array.isArray(list)) fail(`container ${cid} missing`)
    for (const id of list as string[]) {
      if (!board.items[id]) fail(`placement references unknown item ${id}`)
      if (seen.has(id)) fail(`item ${id} placed twice`)
      seen.add(id)
    }
  }
  if (seen.size !== Object.keys(board.items).length) fail('some items are not placed')
}
