/**
 * User-level actions shared by buttons, keyboard shortcuts, menus and the
 * WebMCP tools. Each one is a single undoable step with friendly feedback.
 */
import {
  containerOrder,
  findContainer,
  type NewItem,
  opAddItems,
  opMoveItem,
  opRemoveItems,
} from '@/core/board'
import { COOP, type ContainerId, type ItemId } from '@/core/types'
import type { IngestResult } from '@/images/ingest'
import { boardActions } from '@/state/boardStore'
import { ui } from '@/state/uiStore'

export function containerName(cid: ContainerId): string {
  if (cid === COOP) return 'the Coop'
  const tier = boardActions().board?.tiers.find((t) => t.id === cid)
  return tier ? `tier ${tier.label}` : 'unknown tier'
}

export function itemLabel(id: ItemId): string {
  return boardActions().board?.items[id]?.label || 'Untitled item'
}

/** Moves an item to the end of a container (tap-to-place / number keys). */
export function moveItemTo(id: ItemId, to: ContainerId): void {
  const board = boardActions().board
  if (!board || findContainer(board, id) === to) return
  boardActions().apply((b) => opMoveItem(b, id, to))
  ui().land(id)
  ui().toast({ message: `${itemLabel(id)} moved to ${containerName(to)}` })
}

/** Number key → container: 1–9 are tiers top-down, 0 is the coop. */
export function containerForDigit(digit: number): ContainerId | undefined {
  const board = boardActions().board
  if (!board) return undefined
  if (digit === 0) return COOP
  return board.tiers[digit - 1]?.id
}

/** Moves focus to an item's tile after React has re-rendered it. */
export function focusItem(id: ItemId): void {
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(id)}"]`)?.focus()
  })
}

/**
 * Removes items with an undo toast. `refocus` moves keyboard focus to the
 * next surviving item (or the quick-add field) so it isn't dropped on <body>.
 */
export function removeItems(ids: ItemId[], { refocus = false } = {}): void {
  if (!ids.length) return
  const label = ids.length === 1 ? itemLabel(ids[0] as ItemId) : `${ids.length} items`
  if (refocus) {
    const gone = new Set(ids)
    const order = itemsInOrder()
    const at = order.findIndex((id) => gone.has(id))
    const next =
      order.slice(at + 1).find((id) => !gone.has(id)) ??
      order.slice(0, Math.max(0, at)).findLast((id) => !gone.has(id))
    requestAnimationFrame(() => {
      if (next) focusItem(next)
      else document.getElementById('quick-add')?.focus()
    })
  }
  boardActions().apply((b) => opRemoveItems(b, ids))
  ui().select(null)
  ui().toast({
    message: `Removed ${label}`,
    action: { label: 'Undo', run: () => boardActions().undo() },
  })
}

export function addItems(items: NewItem[], to: ContainerId = COOP): ItemId[] {
  if (!items.length) return []
  let ids: ItemId[] = []
  boardActions().apply((b) => {
    ids = opAddItems(b, items, to)
  })
  ui().hatch(ids)
  return ids
}

/** Adds an ingest batch and reports what happened in one toast. */
export function reportIngest(result: IngestResult): void {
  const ids = addItems(result.items)
  const added = ids.length
  const failed = result.failed.length
  if (added && !failed) {
    ui().toast({ message: `Added ${added} ${added === 1 ? 'item' : 'items'} to the Coop` })
  } else if (added && failed) {
    ui().toast({ message: `Added ${added}. ${failed} couldn't be read.`, tone: 'error' })
  } else if (failed) {
    ui().toast({ message: result.failed[0]?.reason ?? 'Nothing could be added.', tone: 'error' })
  }
}

/** Visual order of every item, used for arrow-key navigation between tiles. */
export function itemsInOrder(): ItemId[] {
  const board = boardActions().board
  if (!board) return []
  return containerOrder(board).flatMap((cid) => board.placement[cid] ?? [])
}
