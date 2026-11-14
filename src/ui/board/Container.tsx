import { useDroppable } from '@dnd-kit/core'
import { rectSortingStrategy, SortableContext } from '@dnd-kit/sortable'
import type { ReactNode } from 'react'
import type { ContainerId, ItemId } from '@/core/types'
import styles from './Container.module.css'
import { SortableItem } from './SortableItem'

interface ContainerProps {
  id: ContainerId
  items: ItemId[]
  label: string
  empty: ReactNode
  className?: string
}

/**
 * A wrapping grid of sortable items. rectSortingStrategy is what keeps
 * drops correct once a tier wraps onto a second line, the bug that breaks
 * most list-based tier makers.
 */
export function Container({ id, items, label, empty, className }: ContainerProps) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { container: id } })
  return (
    <SortableContext id={id} items={items} strategy={rectSortingStrategy}>
      <div
        ref={setNodeRef}
        className={`${styles.grid} ${className ?? ''}`}
        data-over={isOver || undefined}
        data-empty={items.length === 0 || undefined}
      >
        {items.map((itemId, i) => (
          <SortableItem
            key={itemId}
            id={itemId}
            container={id}
            index={i}
            total={items.length}
            containerLabel={label}
          />
        ))}
        {items.length === 0 && <div className={styles.empty}>{empty}</div>}
      </div>
    </SortableContext>
  )
}
