import { forwardRef, type HTMLAttributes, memo } from 'react'
import type { Item } from '@/core/types'
import { useImageUrl } from '../hooks/useImageUrl'
import styles from './ItemTile.module.css'

interface ItemTileProps extends HTMLAttributes<HTMLDivElement> {
  item: Item
  showLabel: boolean
  state?: 'idle' | 'placeholder' | 'overlay' | 'selected' | 'landed'
}

/** The visual tile. Pure presentation — dragging lives in SortableItem. */
export const ItemTile = memo(
  forwardRef<HTMLDivElement, ItemTileProps>(function ItemTile(
    { item, showLabel, state = 'idle', className, ...rest },
    ref,
  ) {
    const url = useImageUrl(item.image)
    const hasImage = Boolean(item.image)
    return (
      <div
        ref={ref}
        className={`${styles.tile} ${className ?? ''}`}
        data-state={state}
        data-kind={hasImage ? 'image' : 'text'}
        {...rest}
      >
        {hasImage ? (
          <>
            {url ? (
              <img src={url} alt="" draggable={false} className={styles.img} decoding="async" />
            ) : (
              <span className={styles.loading} aria-hidden />
            )}
            {showLabel && item.label && <span className={styles.caption}>{item.label}</span>}
          </>
        ) : (
          <span className={styles.text}>
            <span className={styles.clamp}>{item.label || 'Untitled'}</span>
          </span>
        )}
      </div>
    )
  }),
)
