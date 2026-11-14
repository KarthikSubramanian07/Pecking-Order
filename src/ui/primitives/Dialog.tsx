import { type ReactNode, useCallback, useEffect, useId, useRef } from 'react'
import { X } from '@/ui/icons'
import styles from './Dialog.module.css'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  /** Short line under the title. */
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Native <dialog> with showModal(): the browser handles the focus trap,
 * Escape, inert background and top-layer stacking for us, no library needed.
 * Mark the field that should take focus on open with `data-autofocus`.
 */
export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  const opener = useRef<Element | null>(null)
  const restoreFocus = useCallback(() => {
    const target = opener.current
    if (target instanceof HTMLElement && target.isConnected) target.focus()
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) {
      opener.current = document.activeElement
      el.showModal()
      el.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    } else if (!open && el.open) {
      el.close()
      restoreFocus()
    }
  }, [open, restoreFocus])

  // Lazily mounted dialogs unmount instead of closing; hand focus back then too.
  useEffect(() => restoreFocus, [restoreFocus])

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click is a mouse nicety; Escape is the keyboard path (native)
    <dialog
      ref={ref}
      className={styles.dialog}
      data-size={size}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        // Clicks on the ::backdrop land on the <dialog> element itself.
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {open && (
        <div className={styles.panel}>
          <header className={styles.header}>
            <div>
              <h2 id={titleId} className={styles.title}>
                {title}
              </h2>
              {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
            </div>
            <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
              <X size={18} weight="bold" aria-hidden />
            </button>
          </header>
          <div className={styles.body}>{children}</div>
          {footer && <footer className={styles.footer}>{footer}</footer>}
        </div>
      )}
    </dialog>
  )
}
