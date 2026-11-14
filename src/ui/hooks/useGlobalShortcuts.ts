import { useEffect } from 'react'
import { boardActions } from '@/state/boardStore'
import { ui, useUiStore } from '@/state/uiStore'
import { focusItem } from '../actions'
import { isTypingTarget } from '../chrome/keys'
import { ingestTransfer } from './useIngest'

/** App-wide keys and paste. Never fires while the user is typing in a field. */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || useUiStore.getState().dialog) return
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      if (mod && (key === 'z' || key === 'y')) {
        e.preventDefault()
        // Undo can move the focused tile to another row, which remounts it.
        const focused = (e.target as HTMLElement).closest?.<HTMLElement>('[data-item-id]')
        if (key === 'z' && !e.shiftKey) boardActions().undo()
        else boardActions().redo()
        const id = focused?.dataset.itemId
        if (id && boardActions().board?.items[id]) focusItem(id)
      } else if (!mod && e.key === '?') {
        ui().open('shortcuts')
      } else if (e.key === 'Escape') {
        ui().select(null)
      }
    }

    const onPaste = (e: ClipboardEvent) => {
      if (isTypingTarget(e.target) || useUiStore.getState().dialog || !e.clipboardData) return
      e.preventDefault()
      ingestTransfer(e.clipboardData)
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('paste', onPaste)
    }
  }, [])
}
