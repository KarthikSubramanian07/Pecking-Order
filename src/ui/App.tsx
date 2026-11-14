import { lazy, Suspense, useEffect } from 'react'
import { useBoardStore } from '@/state/boardStore'
import { ITEM_SIZE_PX, useUiStore } from '@/state/uiStore'
import styles from './App.module.css'
import { Busy } from './chrome/Busy'
import { DropZone } from './chrome/DropZone'
import { Footer } from './chrome/Footer'
import { TopBar } from './chrome/TopBar'
import { Dialogs } from './dialogs/Dialogs'
import { Home } from './home/Home'
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts'
import { useTheme } from './hooks/useTheme'
import { Toasts } from './primitives/Toasts'
import { useRoute } from './router'

const HOME_TITLE = 'Pecking Order: rank anything'

// The board (drag and drop, motion, dialogs) loads only when a board opens,
// so the home page stays light.
const BoardPage = lazy(() => import('./BoardPage'))

export function App() {
  const ready = useBoardStore((s) => s.ready)
  const itemSize = useUiStore((s) => s.itemSize)
  const route = useRoute()
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
    if (route.name !== 'home') return
    document.title = HOME_TITLE
    void useBoardStore.getState().closeBoard()
  }, [route])

  useEffect(() => {
    document.documentElement.style.setProperty('--item-base', `${ITEM_SIZE_PX[itemSize]}px`)
  }, [itemSize])

  return (
    <div className={styles.app} data-wide={route.name === 'board' || undefined}>
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      <TopBar onBoard={route.name === 'board'} />
      {!ready ? (
        <p className={styles.hatching}>Hatching…</p>
      ) : route.name === 'board' ? (
        <Suspense fallback={<p className={styles.hatching}>Hatching…</p>}>
          <BoardPage key={route.id} id={route.id} />
        </Suspense>
      ) : (
        <Home />
      )}
      <Footer />
      <Dialogs />
      <DropZone />
      <Busy />
      <Toasts />
    </div>
  )
}
