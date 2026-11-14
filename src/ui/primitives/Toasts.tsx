import { X } from '@phosphor-icons/react'
import { useUiStore } from '@/state/uiStore'
import styles from './Toasts.module.css'

/** Polite live region: screen readers hear every toast without losing focus. */
export function Toasts() {
  const toasts = useUiStore((s) => s.toasts)
  const dismiss = useUiStore((s) => s.dismiss)
  return (
    <section className={styles.region} aria-live="polite" aria-label="Notifications">
      {toasts.map((t) => (
        <div key={t.id} className={styles.toast} data-tone={t.tone}>
          <span className={styles.message} role={t.tone === 'error' ? 'alert' : undefined}>
            {t.message}
          </span>
          {t.action && (
            <button
              type="button"
              className={styles.action}
              onClick={() => {
                t.action?.run()
                dismiss(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
          <button
            type="button"
            className={styles.dismiss}
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
          >
            <X size={14} weight="bold" aria-hidden />
          </button>
        </div>
      ))}
    </section>
  )
}
