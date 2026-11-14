import { lazy, Suspense } from 'react'
import { useUiStore } from '@/state/uiStore'
import { ItemDialog } from './ItemDialog'
import { NewBoardDialog } from './NewBoardDialog'
import { ShortcutsDialog } from './ShortcutsDialog'

// Heavier dialogs load on demand to keep first paint lean.
const SearchDialog = lazy(() => import('./SearchDialog'))
const ExportDialog = lazy(() => import('./ExportDialog'))
const PeckOffDialog = lazy(() => import('./PeckOffDialog'))

export function Dialogs() {
  const dialog = useUiStore((s) => s.dialog)
  const close = useUiStore((s) => s.close)
  return (
    <>
      <NewBoardDialog open={dialog === 'new'} onClose={close} />
      <ShortcutsDialog open={dialog === 'shortcuts'} onClose={close} />
      <ItemDialog open={dialog === 'item'} onClose={close} />
      <Suspense fallback={null}>
        {dialog === 'search' && <SearchDialog open onClose={close} />}
        {dialog === 'export' && <ExportDialog open onClose={close} />}
        {dialog === 'peckoff' && <PeckOffDialog open onClose={close} />}
      </Suspense>
    </>
  )
}
