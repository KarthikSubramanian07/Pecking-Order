import { useUiStore } from '@/state/uiStore'
import { Hen } from '../brand/Hen'
import styles from './Busy.module.css'

/** Progress pill for long ingests and pack installs. */
export function Busy() {
  const busy = useUiStore((s) => s.busy)
  if (!busy) return null
  const pct = busy.total ? Math.round((busy.done / busy.total) * 100) : null
  return (
    <div className={styles.busy} role="status">
      <Hen size={22} mood="peck" />
      <span>
        {busy.label}
        {busy.total ? ` ${busy.done} of ${busy.total}` : '…'}
      </span>
      {pct !== null && (
        <span className={styles.track} aria-hidden>
          <span className={styles.fill} style={{ width: `${pct}%` }} />
        </span>
      )}
    </div>
  )
}
