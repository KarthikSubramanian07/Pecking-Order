import { ArrowElbowDownLeft } from '@phosphor-icons/react'
import { memo } from 'react'
import { readableTextOn } from '@/core/palette'
import type { Tier } from '@/core/types'
import { useBoardStore } from '@/state/boardStore'
import { useUiStore } from '@/state/uiStore'
import { moveItemTo } from '../actions'
import { Container } from './Container'
import styles from './TierRow.module.css'
import { TierSettings } from './TierSettings'

interface TierRowProps {
  tier: Tier
  index: number
  count: number
}

export const TierRow = memo(function TierRow({ tier, index, count }: TierRowProps) {
  const items = useBoardStore((s) => s.board?.placement[tier.id]) ?? []
  const selected = useUiStore((s) => s.selected)
  const short = tier.label.length <= 2
  const name = `Tier ${tier.label}`

  return (
    <section
      className={styles.row}
      style={
        { '--tier': tier.color, '--tier-text': readableTextOn(tier.color) } as React.CSSProperties
      }
      aria-label={`${name}, ${items.length} ${items.length === 1 ? 'item' : 'items'}`}
    >
      <TierSettings tier={tier} index={index} count={count}>
        {(props) => (
          <button
            type="button"
            className={styles.label}
            data-short={short || undefined}
            aria-label={`${name} settings`}
            title="Rename, recolour or move this tier"
            {...props}
          >
            <span className={styles.labelText}>{tier.label}</span>
            {index < 9 && (
              <kbd className={styles.key} aria-hidden>
                {index + 1}
              </kbd>
            )}
          </button>
        )}
      </TierSettings>

      <Container
        id={tier.id}
        items={items}
        label={name}
        className={styles.items}
        empty={<span className={styles.hint}>Drop here</span>}
      />

      {selected && (
        <button
          type="button"
          className={styles.placeHere}
          aria-label={`Place selected item in ${name}`}
          onClick={() => {
            moveItemTo(selected, tier.id)
            useUiStore.getState().select(null)
          }}
        >
          <ArrowElbowDownLeft size={15} weight="bold" aria-hidden />
          Place here
        </button>
      )}
    </section>
  )
})
