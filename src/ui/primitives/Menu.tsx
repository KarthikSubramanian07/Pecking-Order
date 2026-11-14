import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import styles from './Menu.module.css'

export interface MenuItem {
  label: string
  icon?: ReactNode
  hint?: string
  /** Makes the item a radio option (one of a set) that exposes its state. */
  checked?: boolean
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
  /** Render a divider before this item. */
  separated?: boolean
}

interface MenuProps {
  /** Renders the trigger; spread `props` onto a <button>. */
  trigger: (props: {
    ref: (el: HTMLButtonElement | null) => void
    'aria-haspopup': 'menu'
    'aria-expanded': boolean
    'aria-controls': string
    onClick: () => void
  }) => ReactNode
  items: (MenuItem | false | null | undefined)[]
  align?: 'start' | 'end'
  label: string
}

/**
 * WAI-ARIA menu button on top of the Popover API: top layer, light dismiss
 * and Escape come from the browser; we add roving focus with arrow keys.
 */
export function Menu({ trigger, items, align = 'end', label }: MenuProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const list = items.filter(Boolean) as MenuItem[]

  const place = useCallback(() => {
    const t = triggerRef.current?.getBoundingClientRect()
    const el = listRef.current
    if (!t || !el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    let left = align === 'end' ? t.right - w : t.left
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8))
    let top = t.bottom + 6
    if (top + h > window.innerHeight - 8) top = Math.max(8, t.top - h - 6)
    el.style.left = `${left}px`
    el.style.top = `${top}px`
  }, [align])

  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    if (open) {
      el.showPopover()
      place()
      el.querySelector<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])')?.focus()
    } else if (el.matches(':popover-open')) {
      el.hidePopover()
    }
  }, [open, place])

  const onKeyDown = (e: KeyboardEvent) => {
    const nodes = [...(listRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])]
    const i = nodes.indexOf(document.activeElement as HTMLElement)
    const go = (n: number) => nodes[(n + nodes.length) % nodes.length]?.focus()
    if (e.key === 'ArrowDown') go(i + 1)
    else if (e.key === 'ArrowUp') go(i - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(nodes.length - 1)
    else if (e.key === 'Tab') setOpen(false)
    else return
    e.preventDefault()
  }

  return (
    <>
      {trigger({
        ref: (el) => {
          triggerRef.current = el
        },
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': id,
        onClick: () => setOpen((o) => !o),
      })}
      <div
        ref={listRef}
        id={id}
        popover="auto"
        role="menu"
        aria-label={label}
        className={styles.menu}
        onKeyDown={onKeyDown}
        onToggle={(e) => {
          const next = (e as unknown as { newState: string }).newState === 'open'
          setOpen(next)
          if (!next) triggerRef.current?.focus({ preventScroll: true })
        }}
      >
        {list.map((item) => (
          <div key={item.label} role="none">
            {item.separated && <hr className={styles.sep} />}
            <button
              type="button"
              {...(item.checked === undefined
                ? { role: 'menuitem' }
                : { role: 'menuitemradio', 'aria-checked': item.checked })}
              tabIndex={-1}
              className={styles.item}
              data-danger={item.danger || undefined}
              aria-disabled={item.disabled || undefined}
              onClick={() => {
                if (item.disabled) return
                setOpen(false)
                item.onSelect()
              }}
            >
              {item.icon && <span className={styles.icon}>{item.icon}</span>}
              <span className={styles.label}>{item.label}</span>
              {item.checked && (
                <span className={styles.hint} aria-hidden>
                  ✓
                </span>
              )}
              {item.hint && <kbd className={styles.hint}>{item.hint}</kbd>}
            </button>
          </div>
        ))}
      </div>
    </>
  )
}
