import { useEffect, useState } from 'react'
import { useBoardStore } from '@/state/boardStore'
import styles from './App.module.css'
import { Board } from './board/Board'
import { Hen } from './brand/Hen'
import btn from './primitives/Button.module.css'
import { Link } from './router'

/** Loads the board named in the URL; boards live only on this device. */
export default function BoardPage({ id }: { id: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading')
  const title = useBoardStore((s) => (s.board?.id === id ? s.board.title : null))

  useEffect(() => {
    let live = true
    void useBoardStore
      .getState()
      .loadBoard(id)
      .then((ok) => live && setState(ok ? 'ok' : 'missing'))
    return () => {
      live = false
    }
  }, [id])

  useEffect(() => {
    if (title) document.title = `${title} · Pecking Order`
  }, [title])

  if (state === 'missing') {
    return (
      <main id="main" className={styles.missing} tabIndex={-1}>
        <Hen size={80} mood="bob" />
        <h1>This board flew the coop.</h1>
        <p>
          Boards are saved only in the browser that made them, so a link to one won't open anywhere
          else. To share a ranking, export it as an image or a .peck backup.
        </p>
        <Link to="/" className={btn.button} data-variant="primary">
          Back home
        </Link>
      </main>
    )
  }

  return (
    <main id="main" className={styles.main} tabIndex={-1} aria-busy={state === 'loading'}>
      {state === 'ok' ? <Board /> : <p className={styles.hatching}>Hatching…</p>}
    </main>
  )
}
