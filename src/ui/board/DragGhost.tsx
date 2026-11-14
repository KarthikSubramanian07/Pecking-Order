import { type MotionValue, useSpring, useTransform, useVelocity } from 'motion/react'
import * as m from 'motion/react-m'
import type { Item } from '@/core/types'
import { useUiStore } from '@/state/uiStore'
import { ItemTile } from './ItemTile'

interface DragGhostProps {
  item: Item
  dragX: MotionValue<number>
  reducedMotion: boolean
}

/**
 * The tile under your finger. It leans into horizontal motion (velocity →
 * spring-damped tilt) and lifts slightly, so dragging feels physical.
 */
export function DragGhost({ item, dragX, reducedMotion }: DragGhostProps) {
  const showLabels = useUiStore((s) => s.showLabels)
  const velocity = useVelocity(dragX)
  const lean = useTransform(velocity, [-1800, 0, 1800], [-7, 0, 7], { clamp: true })
  const rotate = useSpring(lean, { stiffness: 500, damping: 30, mass: 0.8 })

  return (
    <m.div
      initial={reducedMotion ? false : { scale: 1 }}
      animate={reducedMotion ? undefined : { scale: 1.06 }}
      transition={{ type: 'spring', stiffness: 600, damping: 28 }}
      style={reducedMotion ? undefined : { rotate }}
    >
      <ItemTile item={item} showLabel={showLabels} state="overlay" aria-hidden />
    </m.div>
  )
}
