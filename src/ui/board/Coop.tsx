import { useEffect, useMemo, useRef, useState } from 'react'
import { opShuffleCoop, opSortContainer } from '@/core/board'
import { COOP, type ItemId } from '@/core/types'
import { boardActions, useBoardStore } from '@/state/boardStore'
import { useUiStore } from '@/state/uiStore'
import { ArrowsDownUp, ImageSquare, MagnifyingGlass, Plus, Scales, Shuffle } from '@/ui/icons'
import { addItems, moveItemTo } from '../actions'
import { Hen } from '../brand/Hen'
import { useIngest } from '../hooks/useIngest'
import btn from '../primitives/Button.module.css'
import { Container } from './Container'
import styles from './Coop.module.css'

/** The unranked pool, docked to the bottom so it's always one drag away. */
export function Coop({ items, dragging }: { items: ItemId[]; dragging: boolean }) {
  const allItems = useBoardStore((s) => s.board?.items)
  const total = useBoardStore((s) => Object.keys(s.board?.items ?? {}).length)
  const selected = useUiStore((s) => s.selected)
  const open = useUiStore((s) => s.open)
  const { upload } = useIngest()
  const [filter, setFilter] = useState('')
  const [draft, setDraft] = useState('')
  const quickAdd = useRef<HTMLTextAreaElement>(null)
  const dock = useRef<HTMLElement>(null)

  // Publish the dock height so toasts and focused tiles stay clear of it. On short
  // screens the dock stops sticking and covers nothing, so it publishes zero.
  useEffect(() => {
    const el = dock.current
    if (!el) return
    const publish = () => {
      const h = getComputedStyle(el).position === 'sticky' ? el.offsetHeight : 0
      document.documentElement.style.setProperty('--coop-height', `${h}px`)
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

  const addText = () => {
    const labels = draft
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    if (!labels.length) return
    addItems(labels.map((label) => ({ label })))
    setDraft('')
    quickAdd.current?.focus()
  }

  const brandNew = total === 0

  return (
    <section
      ref={dock}
      className={styles.coop}
      data-dragging={dragging || undefined}
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
              }}
            >
              Back to the Coop
            </button>
          )}
        </div>
      </header>

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
          placeholder="Type an item and press Enter, or paste a whole list"
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
              const labels = text
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter(Boolean)
              addItems(labels.slice(0, 200).map((label) => ({ label })))
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
      </form>
    </section>
  )
}
