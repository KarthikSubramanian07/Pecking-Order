import { useEffect, useId, useRef, useState } from 'react'
import { ingestUrl } from '@/images/ingest'
import { type ImageSearchResult, SOURCES } from '@/images/sources'
import { ui } from '@/state/uiStore'
import { Check, MagnifyingGlass } from '@/ui/icons'
import { addItems } from '../actions'
import btn from '../primitives/Button.module.css'
import { Dialog } from '../primitives/Dialog'
import styles from './dialogs.module.css'

export default function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [sourceId, setSourceId] = useState(SOURCES[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ImageSearchResult[]>([])
  const [picked, setPicked] = useState<Map<string, ImageSearchResult>>(new Map())
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const tabsId = useId()
  const reqRef = useRef<AbortController | null>(null)
  const source = SOURCES.find((s) => s.id === sourceId)

  useEffect(() => {
    const q = query.trim()
    reqRef.current?.abort()
    if (!q || !source) {
      setResults([])
      setStatus('idle')
      return
    }
    const ctrl = new AbortController()
    reqRef.current = ctrl
    const t = setTimeout(() => {
      setStatus('loading')
      source
        .search(q, { signal: ctrl.signal })
        .then((r) => {
          setResults(r)
          setStatus('idle')
        })
        .catch((err: unknown) => {
          if (ctrl.signal.aborted) return
          setError(err instanceof Error ? err.message : 'Search failed.')
          setStatus('error')
        })
    }, 350)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [query, source])

  const toggle = (r: ImageSearchResult) => {
    const key = `${r.provider}:${r.id}`
    setPicked((prev) => {
      const next = new Map(prev)
      if (next.has(key)) next.delete(key)
      else next.set(key, r)
      return next
    })
  }

  const add = async () => {
    setAdding(true)
    const chosen = [...picked.values()]
    const settled = await Promise.allSettled(
      chosen.map((r) => ingestUrl(r.fetchUrl, r.credit, r.title)),
    )
    const items = settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []))
    addItems(items)
    const failed = chosen.length - items.length
    ui().toast({
      message: failed
        ? `Added ${items.length}. ${failed} wouldn't download.`
        : `Added ${items.length} to the Coop`,
      tone: failed && !items.length ? 'error' : 'info',
    })
    setAdding(false)
    setPicked(new Map())
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Search free images"
      subtitle="Openly licensed pictures from Wikipedia, Wikimedia Commons and Openverse. Credits are kept with each item."
      size="lg"
      footer={
        <>
          <span className={styles.footNote}>
            {picked.size ? `${picked.size} selected` : 'Pick as many as you like'}
          </span>
          <button type="button" className={btn.button} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={btn.button}
            data-variant="primary"
            disabled={!picked.size || adding}
            onClick={() => void add()}
          >
            {adding ? 'Adding…' : `Add ${picked.size || ''} to the Coop`}
          </button>
        </>
      }
    >
      <div className={styles.searchHead}>
        <div role="tablist" aria-label="Image source" className={styles.tabs}>
          {SOURCES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              id={`${tabsId}-${s.id}`}
              aria-selected={s.id === sourceId}
              aria-controls={`${tabsId}-panel`}
              className={styles.tab}
              onClick={() => setSourceId(s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>
        <label className={styles.searchBox}>
          <MagnifyingGlass size={18} aria-hidden />
          <input
            type="search"
            placeholder="Try “sourdough”, “Studio Ghibli” or “Python”"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search images"
            data-autofocus
          />
        </label>
        {source && <p className={styles.blurb}>{source.blurb}</p>}
      </div>

      <div
        id={`${tabsId}-panel`}
        role="tabpanel"
        aria-labelledby={`${tabsId}-${sourceId}`}
        aria-busy={status === 'loading'}
      >
        {status === 'error' && (
          <p className={styles.empty} role="alert">
            {error}
          </p>
        )}
        {status === 'idle' && query.trim() && results.length === 0 && (
          <p className={styles.empty}>Nothing found. The hen looked everywhere.</p>
        )}
        {!query.trim() && <p className={styles.empty}>Type something to start searching.</p>}
        <ul className={styles.results} data-loading={status === 'loading' || undefined}>
          {results.map((r) => {
            const key = `${r.provider}:${r.id}`
            const on = picked.has(key)
            return (
              <li key={key}>
                <button
                  type="button"
                  className={styles.result}
                  aria-pressed={on}
                  onClick={() => toggle(r)}
                  title={r.credit.author ? `${r.title} by ${r.credit.author}` : r.title}
                >
                  <img src={r.thumbUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  <span className={styles.resultLabel}>{r.title}</span>
                  {on && (
                    <span className={styles.check} aria-hidden>
                      <Check size={14} weight="bold" />
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </Dialog>
  )
}
