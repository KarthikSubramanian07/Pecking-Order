import { ArrowDown, ArrowUp, Broom, Plus, Trash } from '@phosphor-icons/react'
import { type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react'
import { opAddTier, opClearTier, opMoveTier, opRemoveTier, opUpdateTier } from '@/core/board'
import { SWATCHES } from '@/core/palette'
import type { Tier } from '@/core/types'
import { boardActions } from '@/state/boardStore'
import { ui } from '@/state/uiStore'
import styles from './TierSettings.module.css'

interface TierSettingsProps {
  tier: Tier
  index: number
  count: number
  children: (props: {
    ref: (el: HTMLButtonElement | null) => void
    onClick: () => void
    'aria-expanded': boolean
    'aria-controls': string
  }) => ReactNode
}

/** Non-modal popover for one tier: rename, recolour, reorder, clear, delete. */
export function TierSettings({ tier, index, count, children }: TierSettingsProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(tier.label)
  const anchor = useRef<HTMLButtonElement | null>(null)
  const pop = useRef<HTMLDivElement>(null)
  const apply = boardActions().apply

  useLayoutEffect(() => {
    const el = pop.current
    const a = anchor.current?.getBoundingClientRect()
    if (!el || !a) return
    if (open) {
      el.showPopover()
      const w = el.offsetWidth
      const h = el.offsetHeight
      el.style.left = `${Math.max(8, Math.min(a.left, window.innerWidth - w - 8))}px`
      const below = a.bottom + 8
      el.style.top = `${below + h > window.innerHeight - 8 ? Math.max(8, a.top - h - 8) : below}px`
      el.querySelector('input')?.select()
    } else if (el.matches(':popover-open')) {
      el.hidePopover()
    }
  }, [open])

  const commitLabel = () => {
    if (draft.trim() && draft !== tier.label)
      apply((b) => opUpdateTier(b, tier.id, { label: draft }))
  }
  const close = () => {
    commitLabel()
    setOpen(false)
  }

  const run = (fn: () => void) => () => {
    commitLabel()
    fn()
    setOpen(false)
  }

  return (
    <>
      {children({
        ref: (el) => {
          anchor.current = el
        },
        onClick: () => {
          if (!open) setDraft(tier.label)
          setOpen(!open)
        },
        'aria-expanded': open,
        'aria-controls': id,
      })}
      <div
        ref={pop}
        id={id}
        popover="auto"
        role="dialog"
        aria-label={`Tier ${tier.label} settings`}
        className={styles.pop}
        onToggle={(e) => {
          if ((e as unknown as { newState: string }).newState === 'closed') {
            commitLabel()
            setOpen(false)
            anchor.current?.focus({ preventScroll: true })
          }
        }}
      >
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault()
            close()
          }}
        >
          <label className={styles.field}>
            <span className="mono">Name</span>
            <input
              className={styles.input}
              value={draft}
              maxLength={80}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Tier name"
            />
          </label>

          <fieldset className={styles.swatches}>
            <legend className="mono">Colour</legend>
            {SWATCHES.map((s) => (
              <label
                key={s.hex}
                className={styles.swatch}
                style={{ '--c': s.hex } as React.CSSProperties}
                title={s.name}
              >
                <input
                  type="radio"
                  name={`${id}-color`}
                  className="sr-only"
                  checked={tier.color.toLowerCase() === s.hex.toLowerCase()}
                  onChange={() => apply((b) => opUpdateTier(b, tier.id, { color: s.hex }))}
                />
                <span className="sr-only">{s.name}</span>
              </label>
            ))}
            <label className={styles.custom} title="Custom colour">
              <input
                type="color"
                value={tier.color}
                onChange={(e) => apply((b) => opUpdateTier(b, tier.id, { color: e.target.value }))}
                aria-label="Custom colour"
              />
            </label>
          </fieldset>

          <div className={styles.actions}>
            <button
              type="button"
              disabled={index === 0}
              onClick={run(() => apply((b) => opMoveTier(b, tier.id, index - 1)))}
            >
              <ArrowUp size={15} aria-hidden /> Move up
            </button>
            <button
              type="button"
              disabled={index === count - 1}
              onClick={run(() => apply((b) => opMoveTier(b, tier.id, index + 1)))}
            >
              <ArrowDown size={15} aria-hidden /> Move down
            </button>
            <button type="button" onClick={run(() => apply((b) => void opAddTier(b, index)))}>
              <Plus size={15} aria-hidden /> Add above
            </button>
            <button type="button" onClick={run(() => apply((b) => void opAddTier(b, index + 1)))}>
              <Plus size={15} aria-hidden /> Add below
            </button>
            <button type="button" onClick={run(() => apply((b) => opClearTier(b, tier.id)))}>
              <Broom size={15} aria-hidden /> Clear
            </button>
            <button
              type="button"
              data-danger
              disabled={count <= 1}
              onClick={run(() => {
                apply((b) => opRemoveTier(b, tier.id))
                ui().toast({
                  message: `Deleted tier ${tier.label}. Its items went back to the Coop.`,
                  action: { label: 'Undo', run: () => boardActions().undo() },
                })
              })}
            >
              <Trash size={15} aria-hidden /> Delete
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
