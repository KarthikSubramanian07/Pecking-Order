import { useEffect, useRef, useState } from 'react'
import { useUiStore } from '@/state/uiStore'
import { isPeckFile, restoreBackup } from '../backup'
import { Hen } from '../brand/Hen'
import { ingestTransfer } from '../hooks/useIngest'
import styles from './DropZone.module.css'

const accepts = (dt: DataTransfer | null) =>
  Boolean(
    dt && [...dt.types].some((t) => t === 'Files' || t === 'text/uri-list' || t === 'text/html'),
  )

/**
 * Whole-window drop target for files, folders and images dragged from other
 * sites. Item dragging uses pointer events, so the two never collide.
 */
export function DropZone() {
  const [active, setActive] = useState(false)
  const depth = useRef(0)

  useEffect(() => {
    const enter = (e: DragEvent) => {
      if (!accepts(e.dataTransfer) || useUiStore.getState().dialog) return
      depth.current++
      setActive(true)
    }
    const over = (e: DragEvent) => {
      if (!accepts(e.dataTransfer)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const leave = () => {
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setActive(false)
    }
    const drop = (e: DragEvent) => {
      depth.current = 0
      setActive(false)
      if (!accepts(e.dataTransfer) || !e.dataTransfer) return
      e.preventDefault()
      if (useUiStore.getState().dialog) return
      const peck = [...e.dataTransfer.files].find(isPeckFile)
      if (peck) void restoreBackup(peck)
      else ingestTransfer(e.dataTransfer)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [])

  return (
    <div className={styles.zone} data-active={active || undefined} aria-hidden={!active}>
      <div className={styles.card}>
        <Hen size={64} mood="bob" />
        <p className={styles.title}>Drop to add to the Coop</p>
        <p className={styles.sub}>Images, whole folders, or pictures from another tab.</p>
      </div>
    </div>
  )
}
