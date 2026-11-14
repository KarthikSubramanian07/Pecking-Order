import {
  type Announcements,
  type CollisionDetection,
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  type DropAnimation,
  getFirstCollision,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { AnimatePresence, useMotionValue } from 'motion/react'
import * as m from 'motion/react-m'
import { useCallback, useMemo, useRef, useState } from 'react'
import { findContainer, opMoveItem } from '@/core/board'
import { type Board as BoardData, COOP, type ContainerId, type ItemId } from '@/core/types'
import { boardActions, useBoardStore } from '@/state/boardStore'
import { useUiStore } from '@/state/uiStore'
import { containerName, itemLabel } from '../actions'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import styles from './Board.module.css'
import { Coop } from './Coop'
import { DragGhost } from './DragGhost'
import { TierRow } from './TierRow'
import { Welcome } from './Welcome'

const isContainer = (board: BoardData, id: UniqueIdentifier): id is ContainerId =>
  typeof id === 'string' && id in board.placement

const containerOf = (board: BoardData, id: UniqueIdentifier): ContainerId | undefined =>
  isContainer(board, id) ? id : findContainer(board, String(id))

const position = (board: BoardData, id: ItemId) => {
  const cid = findContainer(board, id)
  const list = cid ? (board.placement[cid] ?? []) : []
  return { where: cid ? containerName(cid) : 'nowhere', at: list.indexOf(id) + 1, of: list.length }
}

const announcements: Announcements = {
  onDragStart({ active }) {
    const b = boardActions().board
    if (!b) return
    const p = position(b, String(active.id))
    return `Picked up ${itemLabel(String(active.id))}. It is in ${p.where}, position ${p.at} of ${p.of}.`
  },
  onDragOver({ active }) {
    const b = boardActions().board
    if (!b) return
    const p = position(b, String(active.id))
    return `${itemLabel(String(active.id))} is in ${p.where}, position ${p.at} of ${p.of}.`
  },
  onDragEnd({ active }) {
    const b = boardActions().board
    if (!b) return
    const p = position(b, String(active.id))
    return `Dropped ${itemLabel(String(active.id))} in ${p.where}, position ${p.at} of ${p.of}.`
  },
  onDragCancel({ active }) {
    return `Cancelled. ${itemLabel(String(active.id))} went back where it was.`
  },
}

const screenReaderInstructions = {
  draggable:
    'To pick up an item, press Space or Enter. Use the arrow keys to move it, then Space or Enter to drop it, or Escape to cancel. You can also press 1 to 9 to send it straight to a tier, 0 for the Coop, E to edit and Delete to remove.',
}

export function Board() {
  const board = useBoardStore((s) => s.board)
  const reducedMotion = usePrefersReducedMotion()
  const [activeId, setActiveId] = useState<ItemId | null>(null)
  const lastOverId = useRef<UniqueIdentifier | null>(null)
  const movedContainer = useRef(false)
  const dragX = useMotionValue(0)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    // A short press delay lets people scroll the page with a finger.
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  /**
   * Pointer-first collision detection for nested containers (adapted from the
   * dnd-kit multiple-containers recipe): find the container under the pointer,
   * then the closest item inside it. Remembers the last target so the item
   * doesn't flicker while the layout shifts under it.
   */
  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      const b = boardActions().board
      if (!b) return []
      const pointer = pointerWithin(args)
      const hits = pointer.length > 0 ? pointer : rectIntersection(args)
      let overId = getFirstCollision(hits, 'id')
      if (overId != null) {
        if (isContainer(b, overId)) {
          const inside = b.placement[overId] ?? []
          if (inside.length > 0) {
            overId =
              closestCenter({
                ...args,
                droppableContainers: args.droppableContainers.filter(
                  (c) => c.id !== overId && inside.includes(String(c.id)),
                ),
              })[0]?.id ?? overId
          }
        }
        lastOverId.current = overId
        return [{ id: overId }]
      }
      if (movedContainer.current) lastOverId.current = activeId
      return lastOverId.current ? [{ id: lastOverId.current }] : []
    },
    [activeId],
  )

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id))
    document.documentElement.dataset.dragging = ''
    useUiStore.getState().select(null)
    dragX.jump(0)
    boardActions().beginGesture()
    navigator.vibrate?.(8)
  }

  const onDragMove = ({ delta }: DragMoveEvent) => {
    dragX.set(delta.x)
  }

  /** Cross-container moves happen live, so the item visibly hops rows. */
  const onDragOver = ({ active, over }: DragOverEvent) => {
    const b = boardActions().board
    if (!b || !over) return
    const from = containerOf(b, active.id)
    const to = containerOf(b, over.id)
    if (!from || !to || from === to) return
    const target = b.placement[to] ?? []
    let index = target.length
    if (!isContainer(b, over.id)) {
      const overIndex = target.indexOf(String(over.id))
      const a = active.rect.current.translated
      const after = a ? a.left + a.width / 2 > over.rect.left + over.rect.width / 2 : false
      index = overIndex >= 0 ? overIndex + (after ? 1 : 0) : target.length
    }
    movedContainer.current = true
    boardActions().applyLive((d) => opMoveItem(d, String(active.id), to, index))
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id)
    const b = boardActions().board
    if (b && over) {
      const to = containerOf(b, over.id)
      if (to && !isContainer(b, over.id)) {
        const list = b.placement[to] ?? []
        const overIndex = list.indexOf(String(over.id))
        if (overIndex !== list.indexOf(id) && overIndex >= 0) {
          boardActions().applyLive((d) => opMoveItem(d, id, to, overIndex))
        }
      }
    }
    boardActions().endGesture(Boolean(over))
    finish(id)
  }

  const onDragCancel = () => {
    boardActions().endGesture(false)
    finish(null)
  }

  const finish = (landed: ItemId | null) => {
    setActiveId(null)
    delete document.documentElement.dataset.dragging
    lastOverId.current = null
    movedContainer.current = false
    if (landed) useUiStore.getState().land(landed)
  }

  const dropAnimation: DropAnimation = useMemo(
    () => ({
      duration: reducedMotion ? 0 : 240,
      easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.15)',
      sideEffects: ({ active }) => {
        active.node.style.opacity = '0'
        return () => {
          active.node.style.opacity = ''
        }
      },
    }),
    [reducedMotion],
  )

  if (!board) return null
  const activeItem = activeId ? board.items[activeId] : undefined

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      accessibility={{ announcements, screenReaderInstructions }}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      {Object.keys(board.items).length === 0 && <Welcome />}
      <div className={styles.tiers} data-dragging={activeId ? true : undefined}>
        <AnimatePresence initial={false}>
          {board.tiers.map((tier, i) => (
            <m.div
              key={tier.id}
              // Rows glide when reordered, but never while dnd-kit is measuring a drag.
              layout={activeId || reducedMotion ? false : 'position'}
              initial={reducedMotion ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, height: 0, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 520, damping: 40, mass: 0.9 }}
            >
              <TierRow tier={tier} index={i} count={board.tiers.length} />
            </m.div>
          ))}
        </AnimatePresence>
      </div>
      <Coop items={board.placement[COOP] ?? []} dragging={activeId !== null} />
      <DragOverlay dropAnimation={dropAnimation}>
        {activeItem ? (
          <DragGhost item={activeItem} dragX={dragX} reducedMotion={reducedMotion} />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
