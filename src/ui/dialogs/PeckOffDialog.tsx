import { AnimatePresence } from 'motion/react'
import * as m from 'motion/react-m'
import { useCallback, useEffect, useState } from 'react'
import { containerOrder } from '@/core/board'
import {
  answer,
  distribute,
  estimateRemaining,
  isDone,
  type PeckoffState,
  type Pick,
  question,
  startPeckoff,
} from '@/core/peckoff'
import { COOP, type ItemId } from '@/core/types'
import { boardActions, useBoardStore } from '@/state/boardStore'
import { ui } from '@/state/uiStore'
import { ArrowLeft, ArrowRight, ArrowUUpLeft, Equals } from '@/ui/icons'
import { ItemTile } from '../board/ItemTile'
import { Hen } from '../brand/Hen'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import btn from '../primitives/Button.module.css'
import { Dialog } from '../primitives/Dialog'
import styles from './PeckOff.module.css'

type Scope = 'coop' | 'all'

export default function PeckOffDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const board = useBoardStore((s) => s.board)
  const reduced = usePrefersReducedMotion()
  const [scope, setScope] = useState<Scope>('coop')
  const [history, setHistory] = useState<PeckoffState[]>([])
  const state = history.at(-1)

  const pool = (s: Scope): ItemId[] =>
    !board
      ? []
      : s === 'coop'
        ? (board.placement[COOP] ?? [])
        : containerOrder(board).flatMap((c) => board.placement[c] ?? [])

  const coopCount = board?.placement[COOP]?.length ?? 0
  const allCount = Object.keys(board?.items ?? {}).length

  const begin = (s: Scope) => {
    setScope(s)
    setHistory([startPeckoff(pool(s))])
  }

  const pick = useCallback(
    (p: Pick) => {
      if (!state || isDone(state)) return
      setHistory((h) => [...h, answer(state, p)])
    },
    [state],
  )
  const undo = useCallback(() => setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h)), [])

  const q = state ? question(state) : null
  // Alternate sides so the newcomer isn't always on the left.
  const flip = (state?.answered ?? 0) % 2 === 1
  const left = q ? (flip ? q.other : q.current) : null
  const right = q ? (flip ? q.current : q.other) : null
  const pickSide = useCallback(
    (side: 'left' | 'right') => pick((side === 'left') !== flip ? 'current' : 'other'),
    [pick, flip],
  )

  useEffect(() => {
    if (!open || !q) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') pickSide('left')
      else if (e.key === 'ArrowRight') pickSide('right')
      else if (e.key === 'ArrowDown' || e.key === '=') pick('tie')
      else if (e.key === 'Backspace' || ((e.metaKey || e.ctrlKey) && e.key === 'z')) undo()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, q, pick, pickSide, undo])

  useEffect(() => {
    if (!open) setHistory([])
  }, [open])

  const apply = () => {
    if (!state || !board) return
    const groups = distribute(state.ranked, board.tiers.length)
    boardActions().apply((b) => {
      const moving = new Set(state.ranked)
      for (const cid of Object.keys(b.placement)) {
        b.placement[cid] = (b.placement[cid] ?? []).filter((id) => !moving.has(id))
      }
      b.tiers.forEach((t, i) => {
        b.placement[t.id] = [...(b.placement[t.id] ?? []), ...(groups[i] ?? [])]
      })
      b.updatedAt = Date.now()
    })
    ui().toast({
      message: 'Ranked by peck-off.',
      action: { label: 'Undo', run: () => boardActions().undo() },
    })
    onClose()
  }

  const items = board?.items ?? {}
  const total = state ? state.answered + estimateRemaining(state) : 0
  const progress = state && total ? state.answered / total : 0

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Peck-off"
      subtitle="Two at a time. Pick the better one; the hen does the sorting."
      size="lg"
    >
      {!state && (
        <div className={styles.intro}>
          <Hen size={72} mood="bob" />
          <p>
            Can't decide? Answer a few quick head-to-heads and Peck-off ranks everything for you —
            about {Math.max(1, Math.round(coopCount * Math.log2(Math.max(2, coopCount)) * 0.8))}{' '}
            picks for the Coop.
          </p>
          <div className={styles.introActions}>
            <button
              type="button"
              className={btn.button}
              data-variant="accent"
              disabled={coopCount < 2}
              onClick={() => begin('coop')}
            >
              Rank the Coop ({coopCount})
            </button>
            <button
              type="button"
              className={btn.button}
              disabled={allCount < 2}
              onClick={() => begin('all')}
            >
              Re-rank everything ({allCount})
            </button>
          </div>
        </div>
      )}

      {state && q && left && right && (
        <div className={styles.arena}>
          <div
            className={styles.progress}
            role="progressbar"
            aria-label="Peck-off progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <span style={{ transform: `scaleX(${progress})` }} />
          </div>
          <p className={`aside ${styles.count}`} aria-live="polite">
            Pick {state.answered + 1} · about {estimateRemaining(state)} to go
          </p>
          <div className={styles.pair}>
            <AnimatePresence mode="popLayout" initial={false}>
              {[
                { side: 'left' as const, id: left },
                { side: 'right' as const, id: right },
              ].map(({ side, id }) => {
                const item = items[id]
                if (!item) return null
                return (
                  <m.button
                    key={`${side}-${id}-${state.answered}`}
                    type="button"
                    className={styles.choice}
                    initial={reduced ? false : { opacity: 0, y: 14, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={
                      reduced
                        ? { opacity: 0 }
                        : { opacity: 0, scale: 0.92, transition: { duration: 0.12 } }
                    }
                    whileHover={reduced ? undefined : { y: -4 }}
                    whileTap={reduced ? undefined : { scale: 0.96 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 32 }}
                    onClick={() => pickSide(side)}
                    aria-label={`Pick ${item.label || 'this item'}`}
                    aria-keyshortcuts={side === 'left' ? 'ArrowLeft' : 'ArrowRight'}
                  >
                    <span className={styles.tileWrap}>
                      <ItemTile item={item} showLabel={false} />
                    </span>
                    {item.image && (
                      <span className={styles.choiceLabel}>{item.label || 'Untitled'}</span>
                    )}
                    <span className={styles.key} aria-hidden>
                      {side === 'left' ? (
                        <ArrowLeft size={14} weight="bold" />
                      ) : (
                        <ArrowRight size={14} weight="bold" />
                      )}
                    </span>
                  </m.button>
                )
              })}
            </AnimatePresence>
            <span className={styles.vs} aria-hidden>
              vs
            </span>
          </div>
          <div className={styles.controls}>
            <button
              type="button"
              className={btn.button}
              data-variant="ghost"
              onClick={undo}
              disabled={history.length < 2}
            >
              <ArrowUUpLeft size={16} aria-hidden /> Undo
            </button>
            <button type="button" className={btn.button} onClick={() => pick('tie')}>
              <Equals size={16} aria-hidden /> Can't decide
            </button>
          </div>
        </div>
      )}

      {state && isDone(state) && (
        <div className={styles.result}>
          <p className={styles.resultTitle}>
            Done in {state.answered} {state.answered === 1 ? 'pick' : 'picks'}.
          </p>
          <ol className={styles.ranking}>
            {state.ranked.map((id, i) => (
              <li key={id}>
                <span className={styles.rank}>{i + 1}</span>
                {items[id]?.label || 'Untitled'}
              </li>
            ))}
          </ol>
          <div className={styles.introActions}>
            <button type="button" className={btn.button} data-variant="accent" onClick={apply}>
              Spread across {board?.tiers.length} tiers
            </button>
            <button type="button" className={btn.button} onClick={() => begin(scope)}>
              Start over
            </button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
