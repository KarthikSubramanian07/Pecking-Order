import { Copy, DownloadSimple, Trash, UploadSimple } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import type { BoardSummary } from '@/core/types'
import { useBoardStore } from '@/state/boardStore'
import { ui } from '@/state/uiStore'
import { downloadBackup, pickBackup } from '../backup'
import { useImageUrl } from '../hooks/useImageUrl'
import btn from '../primitives/Button.module.css'
import { Dialog } from '../primitives/Dialog'
import styles from './dialogs.module.css'

const dateFmt = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

function Thumb({ hash }: { hash: string }) {
  const url = useImageUrl(hash)
  return url ? <img src={url} alt="" /> : <span />
}

export function BoardsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const boards = useBoardStore((s) => s.boards)
  const currentId = useBoardStore((s) => s.board?.id)
  const [confirming, setConfirming] = useState<string | null>(null)

  useEffect(() => {
    if (open) void useBoardStore.getState().refreshBoards()
    else setConfirming(null)
  }, [open])

  const openBoard = async (b: BoardSummary) => {
    await useBoardStore.getState().switchBoard(b.id)
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="My boards"
      subtitle={`${boards.length} saved on this device. Nothing leaves it unless you export.`}
      size="lg"
      footer={
        <>
          <span className={styles.footNote}>
            Backups are .peck files: the board plus its images.
          </span>
          <button type="button" className={btn.button} onClick={pickBackup}>
            <UploadSimple size={16} aria-hidden /> Open a backup
          </button>
          <button
            type="button"
            className={btn.button}
            data-variant="primary"
            onClick={() => void downloadBackup()}
          >
            <DownloadSimple size={16} aria-hidden /> Back up current board
          </button>
        </>
      }
    >
      <ul className={styles.boards}>
        {boards.map((b) => (
          <li
            key={b.id}
            className={styles.boardCard}
            data-current={b.id === currentId || undefined}
          >
            <button type="button" className={styles.boardOpen} onClick={() => void openBoard(b)}>
              <span className={styles.mosaic} aria-hidden>
                {b.preview.length ? (
                  b.preview.map((h) => <Thumb key={h} hash={h} />)
                ) : (
                  <span className={styles.egg} />
                )}
              </span>
              <span className={styles.boardTitle}>{b.title}</span>
              <span className={styles.boardMeta}>
                {b.itemCount} items · {b.rankedCount} ranked · {dateFmt.format(b.updatedAt)}
                {b.id === currentId ? ' · open' : ''}
              </span>
            </button>
            <div className={styles.boardActions}>
              {b.id === currentId && (
                <button
                  type="button"
                  className={btn.icon}
                  data-variant="ghost"
                  data-size="sm"
                  aria-label={`Duplicate ${b.title}`}
                  title="Duplicate"
                  onClick={() => void useBoardStore.getState().duplicateBoard().then(onClose)}
                >
                  <Copy size={16} aria-hidden />
                </button>
              )}
              {confirming === b.id ? (
                <button
                  type="button"
                  className={btn.button}
                  data-variant="danger"
                  data-size="sm"
                  onClick={() => {
                    setConfirming(null)
                    void useBoardStore.getState().deleteBoard(b.id)
                    ui().toast({ message: `Deleted “${b.title}”.` })
                  }}
                >
                  Delete forever?
                </button>
              ) : (
                <button
                  type="button"
                  className={btn.icon}
                  data-variant="ghost"
                  data-size="sm"
                  aria-label={`Delete ${b.title}`}
                  title="Delete"
                  onClick={() => setConfirming(b.id)}
                >
                  <Trash size={16} aria-hidden />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}
