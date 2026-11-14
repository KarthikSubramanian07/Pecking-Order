import { LazyMotion } from 'motion/react'
import type { ReactNode } from 'react'

// Only the board and Peck-off animate, so the animation engine loads with them
// (never on the home page), and its features stream in after first paint.
const loadFeatures = () => import('./motionFeatures').then((mod) => mod.default)

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      {children}
    </LazyMotion>
  )
}
