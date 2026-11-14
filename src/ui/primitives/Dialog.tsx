import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react'
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

  // A body that scrolls must be reachable by keyboard, so it becomes a focusable
  // region whenever its content overflows (the shortcuts list on a phone, say).
  const body = useRef<HTMLDivElement>(null)
  const [scrolls, setScrolls] = useState(false)
  useEffect(() => {
    const el = body.current
    if (!open || !el) return
    const measure = () => setScrolls(el.scrollHeight > el.clientHeight + 1)
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    for (const child of el.children) ro.observe(child)
    return () => ro.disconnect()
  }, [open])

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
          <div
            ref={body}
            className={styles.body}
            {...(scrolls && { tabIndex: 0, role: 'region', 'aria-labelledby': titleId })}
          >
            {children}
          </div>
          {footer && <footer className={styles.footer}>{footer}</footer>}
        </div>
      )}
    </dialog>
  )
}
