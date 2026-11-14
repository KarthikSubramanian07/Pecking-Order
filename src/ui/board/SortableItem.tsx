import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { type KeyboardEvent, memo } from 'react'
import type { ContainerId, ItemId } from '@/core/types'
import { useBoardStore } from '@/state/boardStore'
import { useUiStore } from '@/state/uiStore'
import { containerForDigit, focusItem, moveItemTo, removeItems } from '../actions'
import { ItemTile } from './ItemTile'

interface SortableItemProps {
  id: ItemId
  container: ContainerId
  index: number
  total: number
  containerLabel: string
}

export const SortableItem = memo(function SortableItem({
  id,
  container,
  index,
  total,
  containerLabel,
}: SortableItemProps) {
  const item = useBoardStore((s) => s.board?.items[id])
  const showLabels = useUiStore((s) => s.showLabels)
  const selected = useUiStore((s) => s.selected === id)
  const landed = useUiStore((s) => s.landed === id)
  const hatchIndex = useUiStore((s) => s.fresh.get(id))
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    data: { container },
  })

  if (!item) return null

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (/^[0-9]$/.test(e.key)) {
      const to = containerForDigit(Number(e.key))
      if (to) {
        e.preventDefault()
        moveItemTo(id, to)
        focusItem(id)
      }
      return
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      removeItems([id])
      return
    }
    if (e.key === 'e' || e.key === 'F2') {
      e.preventDefault()
      useUiStore.getState().open('item', id)
      return
    }
    if (e.key === 'Escape' && selected) {
      useUiStore.getState().select(null)
      return
    }
    // Set before dnd-kit measures, so the drag starts with the Coop undocked.
    if (e.code === 'Space' || e.code === 'Enter') {
      document.documentElement.dataset.keyboardDrag = ''
    }
    listeners?.onKeyDown?.(e)
  }

  const state = isDragging
    ? 'placeholder'
    : landed
      ? 'landed'
      : selected
        ? 'selected'
        : hatchIndex !== undefined
          ? 'hatching'
          : 'idle'

  return (
    <ItemTile
      ref={setNodeRef}
      item={item}
      showLabel={showLabels}
      state={state}
      data-item-id={id}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        animationDelay: hatchIndex ? `${hatchIndex * 28}ms` : undefined,
      }}
      {...attributes}
      {...listeners}
      aria-label={`${item.label || 'Untitled item'}, ${containerLabel}, ${index + 1} of ${total}`}
      aria-pressed={selected}
      onKeyDown={onKeyDown}
      onClick={() => useUiStore.getState().select(selected ? null : id)}
      onDoubleClick={() => useUiStore.getState().open('item', id)}
    />
  )
})
