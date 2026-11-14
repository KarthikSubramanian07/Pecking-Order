import { HEN_PATHS, HEN_STROKE_WIDTH } from '@/brand/hen'
import styles from './Hen.module.css'

interface HenProps {
  size?: number
  /** Idle animation: a gentle bob, or a peck. */
  mood?: 'still' | 'bob' | 'peck'
  className?: string
  title?: string
}

/** The mascot. Decorative unless given a title. */
export function Hen({ size = 48, mood = 'still', className, title }: HenProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={`${styles.hen} ${className ?? ''}`}
      data-mood={mood}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      fill="none"
      strokeWidth={HEN_STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g className={styles.body}>
        {HEN_PATHS.map((p) => (
          <path
            key={p.d}
            d={p.d}
            className={
              p.fill === 'accent' ? styles.accent : p.fill === 'ink' ? styles.ink : styles.line
            }
            stroke={p.noStroke ? 'none' : undefined}
          />
        ))}
      </g>
    </svg>
  )
}
