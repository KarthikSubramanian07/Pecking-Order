import { useEffect, useMemo, useRef, useState } from 'react'
import { opShuffleCoop, opSortContainer } from '@/core/board'
import { COOP, type ItemId } from '@/core/types'
import { boardActions, useBoardStore } from '@/state/boardStore'
import { useUiStore } from '@/state/uiStore'
import {
  ArrowsDownUp,
  CaretDown,
  CaretUp,
  ImageSquare,
  MagnifyingGlass,
  Plus,
  Scales,
  Shuffle,
} from '@/ui/icons'
import { addItems, focusItem, moveItemTo } from '../actions'
import { Hen } from '../brand/Hen'
import { useIngest } from '../hooks/useIngest'
import btn from '../primitives/Button.module.css'
import { Container } from './Container'
import styles from './Coop.module.css'

/**
 * The unranked pool, always one drag away: a sidebar beside the tiers on wide
 * screens, docked to the bottom edge on narrow ones.
 */
export function Coop({ items, dragging }: { items: ItemId[]; dragging: boolean }) {
  const allItems = useBoardStore((s) => s.board?.items)
  const total = useBoardStore((s) => Object.keys(s.board?.items ?? {}).length)
  const selected = useUiStore((s) => s.selected)
  const open = useUiStore((s) => s.open)
  const { upload } = useIngest()
  const [filter, setFilter] = useState('')
  // Docked at the bottom on narrow screens, the Coop can fold down to its header.
  const [folded, setFolded] = useState(false)
  const [draft, setDraft] = useState('')
  // Quick adds have no toast, so screen readers hear about them here.
  const [added, setAdded] = useState('')
  const quickAdd = useRef<HTMLTextAreaElement>(null)
  const dock = useRef<HTMLElement>(null)

  // Publish the dock height so toasts and focused tiles stay clear of it. As a
  // sidebar, or on short screens, the Coop covers nothing and publishes zero.
  useEffect(() => {
    const el = dock.current
    if (!el) return
    const publish = () => {
      const css = getComputedStyle(el)
      const docked = css.position === 'sticky' && css.getPropertyValue('--docked').trim() === '1'
      const h = docked ? el.offsetHeight : 0
      document.documentElement.style.setProperty('--coop-height', `${h}px`)
      // As a sidebar, the Coop is as tall as the space below the board title, so
      // its header and add box never scroll out of view.
      const top = (el.parentElement?.getBoundingClientRect().top ?? 0) + window.scrollY
      el.style.setProperty('--coop-top', `${Math.round(top)}px`)
    }
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    window.addEventListener('resize', publish)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', publish)
    }
  }, [])

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q || !allItems) return items
    return items.filter((id) => allItems[id]?.label.toLowerCase().includes(q))
  }, [items, allItems, filter])

  const addLabels = (labels: string[]) => {
    if (!labels.length) return
    addItems(labels.map((label) => ({ label })))
    setAdded(
      labels.length === 1
        ? `Added ${labels[0]} to the Coop.`
        : `Added ${labels.length} items to the Coop.`,
    )
  }

  const addText = () => {
    const labels = draft
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    if (!labels.length) return
    addLabels(labels)
    setDraft('')
    quickAdd.current?.focus()
  }

  const brandNew = total === 0

  return (
    <section
      ref={dock}
      className={styles.coop}
      data-dragging={dragging || undefined}
      data-folded={folded || undefined}
      aria-labelledby="coop-title"
      data-empty={brandNew || undefined}
    >
      <header className={styles.head}>
        <div className={styles.titleWrap}>
          <h2 id="coop-title" className={styles.title}>
            The Coop
          </h2>
          <span className="aside">
            {items.length} unranked{total > 0 ? ` · ${total - items.length} ranked` : ''}
          </span>
        </div>

        <div className={styles.tools}>
          {items.length > 6 && (
            <label className={styles.filter}>
              <MagnifyingGlass size={15} aria-hidden />
              <input
                type="search"
                placeholder="Filter"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                aria-label="Filter unranked items"
              />
            </label>
          )}
          {items.length > 1 && (
            <>
              <button
                type="button"
                className={btn.button}
                data-size="sm"
                data-variant="accent"
                onClick={() => open('peckoff')}
                title="Rank by head-to-head picks"
              >
                <Scales size={16} aria-hidden /> Peck-off
              </button>
              <button
                type="button"
                className={btn.icon}
                data-variant="ghost"
                data-size="sm"
                aria-label="Shuffle the Coop"
                title="Shuffle"
                onClick={() => boardActions().apply((b) => opShuffleCoop(b))}
              >
                <Shuffle size={17} aria-hidden />
              </button>
              <button
                type="button"
                className={btn.icon}
                data-variant="ghost"
                data-size="sm"
                aria-label="Sort the Coop A to Z"
                title="Sort A–Z"
                onClick={() => boardActions().apply((b) => opSortContainer(b, COOP))}
              >
                <ArrowsDownUp size={17} aria-hidden />
              </button>
            </>
          )}
          {selected && (
            <button
              type="button"
              className={btn.button}
              data-size="sm"
              onClick={() => {
                moveItemTo(selected, COOP)
                useUiStore.getState().select(null)
                focusItem(selected)
              }}
            >
              Back to the Coop
            </button>
          )}
        </div>
        {!brandNew && (
          <button
            type="button"
            className={`${btn.icon} ${styles.fold}`}
            data-variant="ghost"
            data-size="sm"
            aria-expanded={!folded}
            aria-label={folded ? 'Show the Coop' : 'Fold the Coop away'}
            title={folded ? 'Show' : 'Fold away'}
            onClick={() => setFolded((f) => !f)}
          >
            {folded ? <CaretUp size={17} aria-hidden /> : <CaretDown size={17} aria-hidden />}
          </button>
        )}
      </header>

      <form
        className={styles.quick}
        onSubmit={(e) => {
          e.preventDefault()
          addText()
        }}
      >
        <label className="sr-only" htmlFor="quick-add">
          Add text items, one per line
        </label>
        <textarea
          id="quick-add"
          ref={quickAdd}
          rows={1}
          value={draft}
          placeholder="Add an item, or paste a list"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              addText()
            }
          }}
          onPaste={(e) => {
            // Multi-line text pastes become one item per line immediately.
            const text = e.clipboardData.getData('text/plain')
            if (text.includes('\n') && !e.clipboardData.files.length) {
              e.preventDefault()
              addLabels(
                text
                  .split(/\r?\n/)
                  .map((l) => l.trim())
                  .filter(Boolean)
                  .slice(0, 200),
              )
            }
          }}
        />
        <button
          type="submit"
          className={btn.icon}
          data-variant="primary"
          data-size="sm"
          aria-label="Add item"
          disabled={!draft.trim()}
        >
          <Plus size={16} weight="bold" aria-hidden />
        </button>
        <span className={styles.or} aria-hidden>
          or
        </span>
        <button type="button" className={btn.button} data-size="sm" onClick={() => void upload()}>
          <ImageSquare size={16} aria-hidden /> <span className={styles.buttonText}>Upload</span>
        </button>
        <button type="button" className={btn.button} data-size="sm" onClick={() => open('search')}>
          <MagnifyingGlass size={16} aria-hidden />{' '}
          <span className={styles.buttonText}>Search</span>
        </button>
        <p className="sr-only" role="status">
          {added}
        </p>
      </form>

      {!brandNew && (
        <Container
          id={COOP}
          items={visible}
          label="the Coop"
          className={styles.grid}
          empty={
            filter ? (
              <span>No unranked items match “{filter}”.</span>
            ) : (
              <span className={styles.allRanked}>
                <Hen size={28} /> Everything has a place. The hen approves.
              </span>
            )
          }
        />
      )}
    </section>
  )
}
