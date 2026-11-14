import { useEffect } from 'react'
import { useBoardStore } from '@/state/boardStore'
import { ITEM_SIZE_PX, useUiStore } from '@/state/uiStore'
import styles from './App.module.css'
import { Board } from './board/Board'
import { Busy } from './chrome/Busy'
import { DropZone } from './chrome/DropZone'
import { Footer } from './chrome/Footer'
import { TopBar } from './chrome/TopBar'
import { Dialogs } from './dialogs/Dialogs'
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts'
import { useTheme } from './hooks/useTheme'
import { Toasts } from './primitives/Toasts'

export function App() {
  const ready = useBoardStore((s) => s.ready)
  const itemSize = useUiStore((s) => s.itemSize)
  useTheme()
  useGlobalShortcuts()

  useEffect(() => {
    void useBoardStore.getState().init()
    const flush = () => void useBoardStore.getState().flush()
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', flush)
    }
  }, [])

  useEffect(() => {
    document.documentElement.style.setProperty('--item', `${ITEM_SIZE_PX[itemSize]}px`)
  }, [itemSize])

  return (
    <div className={styles.app}>
      <a className={styles.skip} href="#board">
        Skip to board
      </a>
      <TopBar />
      <main id="board" className={styles.main} tabIndex={-1} aria-busy={!ready}>
        {ready ? <Board /> : <p className={styles.hatching}>Hatching…</p>}
      </main>
      <Footer />
      <Dialogs />
      <DropZone />
      <Busy />
      <Toasts />
    </div>
  )
}
