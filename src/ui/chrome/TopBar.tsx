import { useEffect, useState } from 'react'
import { opSetTitle } from '@/core/board'
import { COOP } from '@/core/types'
import { boardActions, useBoardStore } from '@/state/boardStore'
import { type ItemSize, useUiStore } from '@/state/uiStore'
import {
  ArrowArcLeft,
  ArrowArcRight,
  Copy,
  DotsThreeOutline,
  DownloadSimple,
  Export,
  Keyboard,
  Monitor,
  Moon,
  Plus,
  SquaresFour,
  Sun,
  Trash,
} from '@/ui/icons'
import { downloadBackup } from '../backup'
import { Hen } from '../brand/Hen'
import btn from '../primitives/Button.module.css'
import { Menu } from '../primitives/Menu'
import { boardPath, Link, navigate } from '../router'
import { isMac } from './keys'
import styles from './TopBar.module.css'

const SIZE_LABEL: Record<ItemSize, string> = {
  sm: 'Small tiles',
  md: 'Medium tiles',
  lg: 'Large tiles',
}

export function TopBar({ onBoard: onBoardRoute }: { onBoard: boolean }) {
  // Board controls only make sense once a board has actually loaded.
  const onBoard = useBoardStore((s) => onBoardRoute && s.board !== null)
  const title = useBoardStore((s) => s.board?.title ?? '')
  const total = useBoardStore((s) => Object.keys(s.board?.items ?? {}).length)
  const unranked = useBoardStore((s) => s.board?.placement[COOP]?.length ?? 0)
  const saveStatus = useBoardStore((s) => s.saveStatus)
  const canUndo = useBoardStore((s) => s.history.past.length > 0)
  const canRedo = useBoardStore((s) => s.history.future.length > 0)
  const { theme, itemSize, showLabels, setPref, open } = useUiStore()
  const [draft, setDraft] = useState(title)
  const mod = isMac() ? '⌘' : 'Ctrl+'

  useEffect(() => setDraft(title), [title])

  useEffect(() => {
    if (title) document.title = `${title} · Pecking Order`
  }, [title])

  const commit = () => {
    if (draft.trim() !== title) boardActions().apply((b) => opSetTitle(b, draft))
    else setDraft(title)
  }

  return (
    <header className={styles.bar}>
      <div className={styles.top}>
        <Link to="/" className={styles.brand} aria-label="Pecking Order home">
          <Hen size={30} mood="still" />
          <span className={styles.wordmark}>Pecking Order</span>
        </Link>

        <nav className={styles.actions} aria-label={onBoard ? 'Board actions' : 'Site actions'}>
          {onBoard && (
            <Link to="/" className={btn.button} data-variant="ghost">
              <SquaresFour size={18} aria-hidden />
              <span className={styles.hideSm}>All boards</span>
            </Link>
          )}
          <button
            type="button"
            className={btn.button}
            data-variant="ghost"
            onClick={() => open('new')}
          >
            <Plus size={18} aria-hidden />
            <span className={styles.hideSm}>New</span>
          </button>
          {onBoard && (
            <>
              <span className={styles.divider} aria-hidden />
              <button
                type="button"
                className={btn.icon}
                data-variant="ghost"
                onClick={() => boardActions().undo()}
                disabled={!canUndo}
                aria-label="Undo"
                title={`Undo (${mod}Z)`}
              >
                <ArrowArcLeft size={18} aria-hidden />
              </button>
              <button
                type="button"
                className={btn.icon}
                data-variant="ghost"
                onClick={() => boardActions().redo()}
                disabled={!canRedo}
                aria-label="Redo"
                title={`Redo (${mod}⇧Z)`}
              >
                <ArrowArcRight size={18} aria-hidden />
              </button>
            </>
          )}
          <Menu
            label="View and settings"
            trigger={(props) => (
              <button
                type="button"
                className={btn.icon}
                data-variant="ghost"
                aria-label="View and settings"
                {...props}
              >
                <DotsThreeOutline size={18} aria-hidden />
              </button>
            )}
            items={[
              {
                label: 'Light theme',
                icon: <Sun size={16} />,
                checked: theme === 'light',
                onSelect: () => setPref('theme', 'light'),
              },
              {
                label: 'Dark theme',
                icon: <Moon size={16} />,
                checked: theme === 'dark',
                onSelect: () => setPref('theme', 'dark'),
              },
              {
                label: 'Match system',
                icon: <Monitor size={16} />,
                checked: theme === 'system',
                onSelect: () => setPref('theme', 'system'),
              },
              ...(['sm', 'md', 'lg'] as const).map((size, i) => ({
                label: SIZE_LABEL[size],
                separated: i === 0,
                checked: itemSize === size,
                onSelect: () => setPref('itemSize', size),
              })),
              {
                label: showLabels ? 'Hide image labels' : 'Show image labels',
                onSelect: () => setPref('showLabels', !showLabels),
              },
              onBoard && {
                label: 'Back up this board',
                icon: <DownloadSimple size={16} />,
                separated: true,
                onSelect: () => void downloadBackup(),
              },
              onBoard && {
                label: 'Duplicate board',
                icon: <Copy size={16} />,
                onSelect: async () => {
                  const id = await boardActions().duplicateBoard()
                  if (id) navigate(boardPath(id))
                },
              },
              onBoard && {
                label: 'Delete board',
                icon: <Trash size={16} />,
                danger: true,
                onSelect: async () => {
                  const board = boardActions().board
                  if (!board || !window.confirm(`Delete “${board.title}”? This can't be undone.`))
                    return
                  await boardActions().deleteBoard(board.id)
                  navigate('/')
                },
              },
              {
                label: 'Keyboard shortcuts',
                icon: <Keyboard size={16} />,
                hint: '?',
                separated: true,
                onSelect: () => open('shortcuts'),
              },
            ]}
          />
          {onBoard && (
            <button
              type="button"
              className={btn.button}
              data-variant="accent"
              onClick={() => open('export')}
            >
              <Export size={18} weight="bold" aria-hidden />
              <span className={styles.hideXs}>Export</span>
            </button>
          )}
        </nav>
      </div>

      {onBoard && (
        <div className={styles.titleRow}>
          <h1 className="sr-only">{title}</h1>
          <input
            className={styles.title}
            value={draft}
            maxLength={120}
            aria-label="Board title"
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                setDraft(title)
                requestAnimationFrame(() => (e.target as HTMLInputElement).blur())
              }
            }}
          />
          <svg
            className={styles.underline}
            viewBox="0 0 300 12"
            preserveAspectRatio="none"
            aria-hidden
          >
            <path d="M2 8c40-5 90-6 140-3s100 2 156-3" />
          </svg>
          <p className={`aside ${styles.meta}`}>
            <span>
              {total} {total === 1 ? 'item' : 'items'}, {total - unranked} ranked
            </span>
            <span aria-hidden>·</span>
            <span className={styles.save} data-status={saveStatus}>
              {saveStatus === 'saving'
                ? 'saving…'
                : saveStatus === 'error'
                  ? 'not saved, storage may be full'
                  : 'saved on this device'}
            </span>
          </p>
          {/* Every edit saves, so only a failure is worth interrupting for. */}
          <p className="sr-only" role="alert">
            {saveStatus === 'error' ? 'Not saved. Storage may be full.' : ''}
          </p>
        </div>
      )}
    </header>
  )
}
