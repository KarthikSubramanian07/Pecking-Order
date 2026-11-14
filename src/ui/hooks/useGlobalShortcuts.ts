import { useEffect } from 'react'
import { boardActions } from '@/state/boardStore'
import { ui, useUiStore } from '@/state/uiStore'
import { isTypingTarget } from '../chrome/keys'
import { ingestTransfer } from './useIngest'

/** App-wide keys and paste. Never fires while the user is typing in a field. */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || useUiStore.getState().dialog) return
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      if (mod && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) boardActions().redo()
        else boardActions().undo()
      } else if (mod && key === 'y') {
        e.preventDefault()
        boardActions().redo()
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
