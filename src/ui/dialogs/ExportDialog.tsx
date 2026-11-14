import { ClipboardText, DownloadSimple, ShareNetwork } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_EXPORT,
  type ExportFormat,
  type ExportOptions,
  renderBoardImage,
} from '@/export/render'
import {
  canShareFiles,
  copyImageToClipboard,
  downloadBlob,
  fileNameFor,
  shareImage,
} from '@/export/share'
import { useBoardStore } from '@/state/boardStore'
import { ui } from '@/state/uiStore'
import btn from '../primitives/Button.module.css'
import { Dialog } from '../primitives/Dialog'
import styles from './dialogs.module.css'

const FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: 'auto', label: 'Fit', hint: 'Grows to fit' },
  { id: 'wide', label: 'Wide', hint: 'X / Bluesky' },
  { id: 'portrait', label: 'Portrait', hint: 'Instagram 4:5' },
  { id: 'story', label: 'Story', hint: '9:16' },
]

const BYLINE_KEY = 'pecking-order:byline'

export default function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const board = useBoardStore((s) => s.board)
  const [opts, setOpts] = useState<ExportOptions>(() => ({
    ...DEFAULT_EXPORT,
    theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
    byline: localStorage.getItem(BYLINE_KEY) ?? '',
  }))
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState('')
  const latest = useRef<Promise<Blob> | null>(null)
  const set = <K extends keyof ExportOptions>(k: K, v: ExportOptions[K]) =>
    setOpts((o) => ({ ...o, [k]: v }))

  // Final-quality renders are cheap enough to use as the live preview.
  useEffect(() => {
    if (!board) return
    let url: string | null = null
    let live = true
    const t = setTimeout(() => {
      const job = renderBoardImage(board, opts)
      latest.current = job
      job
        .then((blob) => {
          if (!live) return
          url = URL.createObjectURL(blob)
          setPreview(url)
          setError('')
        })
        .catch(
          (err: unknown) => live && setError(err instanceof Error ? err.message : 'Export failed.'),
        )
    }, 120)
    return () => {
      live = false
      clearTimeout(t)
      if (url) URL.revokeObjectURL(url)
    }
  }, [board, opts])

  useEffect(() => {
    try {
      localStorage.setItem(BYLINE_KEY, opts.byline ?? '')
    } catch {
      // Not critical.
    }
  }, [opts.byline])

  const name = useMemo(() => fileNameFor(board?.title ?? 'pecking-order'), [board?.title])
  const blob = () =>
    latest.current ??
    (board ? renderBoardImage(board, opts) : Promise.reject(new Error('No board')))

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Export image"
      subtitle="A clean PNG, rendered on your device."
      size="lg"
      footer={
        <>
          {canShareFiles() && (
            <button
              type="button"
              className={btn.button}
              onClick={async () => {
                if (await shareImage(await blob(), board?.title ?? 'Pecking Order')) onClose()
              }}
            >
              <ShareNetwork size={18} aria-hidden /> Share
            </button>
          )}
          <button
            type="button"
            className={btn.button}
            onClick={async () => {
              const ok = await copyImageToClipboard(blob())
              ui().toast(
                ok
                  ? { message: 'Copied. Paste it anywhere.' }
                  : {
                      message: "Your browser won't copy images. Download it instead.",
                      tone: 'error',
                    },
              )
            }}
          >
            <ClipboardText size={18} aria-hidden /> Copy
          </button>
          <button
            type="button"
            className={btn.button}
            data-variant="accent"
            onClick={async () => {
              downloadBlob(await blob(), name)
              ui().toast({ message: 'Laid. Check your downloads.' })
            }}
          >
            <DownloadSimple size={18} weight="bold" aria-hidden /> Download PNG
          </button>
        </>
      }
    >
      <div className={styles.exportGrid}>
        <div className={styles.previewPane} data-theme={opts.theme}>
          {preview ? (
            <img src={preview} alt={`Export preview of ${board?.title ?? 'this board'}`} />
          ) : (
            <p className={styles.empty}>{error || 'Rendering…'}</p>
          )}
        </div>
        <div className={styles.exportOptions}>
          <fieldset className={styles.segmented}>
            <legend className="mono">Size</legend>
            {FORMATS.map((f) => (
              <label key={f.id}>
                <input
                  type="radio"
                  name="export-format"
                  className="sr-only"
                  checked={opts.format === f.id}
                  onChange={() => set('format', f.id)}
                />
                <span>{f.label}</span>
                <small>{f.hint}</small>
              </label>
            ))}
          </fieldset>
          <fieldset className={styles.segmented} data-cols="2">
            <legend className="mono">Theme</legend>
            {(['light', 'dark'] as const).map((t) => (
              <label key={t}>
                <input
                  type="radio"
                  name="export-theme"
                  className="sr-only"
                  checked={opts.theme === t}
                  onChange={() => set('theme', t)}
                />
                <span>{t === 'light' ? 'Paper' : 'Ink'}</span>
              </label>
            ))}
          </fieldset>
          <label className={styles.field}>
            <span className="mono">Byline (optional)</span>
            <input
              className={styles.input}
              placeholder="ranked by @you"
              maxLength={60}
              value={opts.byline ?? ''}
              onChange={(e) => set('byline', e.target.value)}
            />
          </label>
          <label className={styles.check2}>
            <input
              type="checkbox"
              checked={opts.showLabels}
              onChange={(e) => set('showLabels', e.target.checked)}
            />
            Show labels on images
          </label>
          <label className={styles.check2}>
            <input
              type="checkbox"
              checked={opts.includeCoop}
              onChange={(e) => set('includeCoop', e.target.checked)}
            />
            Include unranked items
          </label>
        </div>
      </div>
    </Dialog>
  )
}
