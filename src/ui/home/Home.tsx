import { useEffect, useMemo, useState } from 'react'
import { SWATCHES } from '@/core/palette'
import type { BoardSummary } from '@/core/types'
import { listPacks } from '@/packs/install'
import type { PackSummary } from '@/packs/types'
import { useBoardStore } from '@/state/boardStore'
import { ui } from '@/state/uiStore'
import { pickBackup } from '../backup'
import { Hen } from '../brand/Hen'
import { useImageUrl } from '../hooks/useImageUrl'
import { ArrowRight, MagnifyingGlass, Trash } from '../icons'
import btn from '../primitives/Button.module.css'
import { boardPath, Link } from '../router'
import { startBlank, startFromPack } from '../start'
import styles from './Home.module.css'

const FEATURED = 'Featured'
/** Cards on the first page; the contribute card makes it an even dozen. */
const PAGE = 11
const ALL = 'All'
const accentHex = (name?: string) => SWATCHES.find((s) => s.name === name)?.hex ?? '#d97757'
const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

export function Home() {
  const boards = useBoardStore((s) => s.boards)
  const [packs, setPacks] = useState<PackSummary[]>([])
  const [title, setTitle] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(ALL)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    void listPacks().then(setPacks)
    void useBoardStore.getState().refreshBoards()
  }, [])

  const categories = useMemo(
    () => [ALL, FEATURED, ...[...new Set(packs.map((p) => p.category))].sort()],
    [packs],
  )

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return packs
      .filter((p) =>
        category === ALL ? true : category === FEATURED ? p.featured : p.category === category,
      )
      .filter(
        (p) =>
          !q ||
          [p.title, p.description, p.category, ...p.sample].some((s) =>
            s.toLowerCase().includes(q),
          ),
      )
      .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)))
  }, [packs, query, category])

  // Browsing everything starts with a tidy first page; filters always show all matches.
  const browsingAll = category === ALL && !query.trim()
  const visible = browsingAll && !expanded ? shown.slice(0, PAGE) : shown
  const countFor = (c: string) =>
    c === ALL
      ? packs.length
      : c === FEATURED
        ? packs.filter((p) => p.featured).length
        : packs.filter((p) => p.category === c).length

  return (
    <main id="main" className={styles.home} tabIndex={-1}>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <h1 id="hero-title" className={styles.headline}>
            Rank anything<span className={styles.dot}>.</span>
          </h1>
          <p className={styles.lede}>
            Movies, snacks, programming languages, your friends' cooking. Drag it into tiers, export
            a clean image, start an argument. Free, no account, and nothing leaves your device.
          </p>
          <form
            className={styles.start}
            onSubmit={(e) => {
              e.preventDefault()
              void startBlank(title)
            }}
          >
            <label htmlFor="start-title" className="sr-only">
              What are you ranking?
            </label>
            <input
              id="start-title"
              className={styles.startInput}
              placeholder="What are you ranking?"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              autoComplete="off"
            />
            <button type="submit" className={btn.button} data-variant="primary">
              Start ranking <ArrowRight size={16} weight="bold" aria-hidden />
            </button>
          </form>
          <p className={styles.hint}>
            Or pick a template below, drop a folder of images anywhere on this page, or{' '}
            <button type="button" className={styles.inlineLink} onClick={pickBackup}>
              open a backup
            </button>
            .
          </p>
        </div>
        <HeroArt />
      </section>

      {boards.length > 0 && (
        <section className={styles.section} aria-labelledby="yours-title">
          <div className={styles.sectionHead}>
            <h2 id="yours-title">Your boards</h2>
            <p className="aside">Saved on this device</p>
          </div>
          <ul className={styles.boardGrid}>
            {boards.map((b) => (
              <BoardCard key={b.id} board={b} />
            ))}
          </ul>
        </section>
      )}

      <section className={styles.section} aria-labelledby="templates-title">
        <div className={styles.sectionHead}>
          <h2 id="templates-title">Start from a template</h2>
          <label className={styles.search}>
            <MagnifyingGlass size={16} aria-hidden />
            <span className="sr-only">Search templates</span>
            <input
              type="search"
              placeholder="Search templates"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        <fieldset className={styles.chips}>
          <legend className="sr-only">Filter templates by category</legend>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              className={styles.chip}
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
            >
              {c} <span className={styles.chipCount}>{countFor(c)}</span>
            </button>
          ))}
        </fieldset>
        <p className="sr-only" role="status">
          {shown.length} {shown.length === 1 ? 'template' : 'templates'}
        </p>
        <ul className={styles.templateGrid}>
          {visible.map((p) => (
            <TemplateCard key={p.id} pack={p} />
          ))}
          <li>
            {shown.length === 0 && query.trim() ? (
              <button
                type="button"
                className={styles.contribute}
                onClick={() => void startBlank(query)}
              >
                <span className={styles.contributeTitle}>No template for “{query.trim()}” yet</span>
                <span>Start a blank list with that title instead.</span>
              </button>
            ) : (
              <a
                className={styles.contribute}
                href="https://github.com/KarthikSubramanian07/Pecking-Order/blob/main/CONTRIBUTING-PACKS.md"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Hen size={40} />
                <span className={styles.contributeTitle}>Your topic here</span>
                <span>Know something everyone argues about? A template is one JSON file.</span>
              </a>
            )}
          </li>
        </ul>
        {visible.length < shown.length && (
          <button
            type="button"
            className={`${btn.button} ${styles.more}`}
            onClick={() => setExpanded(true)}
          >
            Show all {shown.length} templates
          </button>
        )}
      </section>
    </main>
  )
}

function TemplateCard({ pack }: { pack: PackSummary }) {
  return (
    <li>
      <button
        type="button"
        className={styles.template}
        style={{ '--accent': accentHex(pack.accent) } as React.CSSProperties}
        onClick={() => void startFromPack(pack)}
      >
        <span className={styles.cover}>
          {pack.coverImage ? (
            <img
              src={pack.coverImage}
              alt=""
              loading="lazy"
              decoding="async"
              width={480}
              height={300}
            />
          ) : (
            <span className={styles.coverText}>{pack.sample.slice(0, 3).join(' · ')}</span>
          )}
          {pack.featured && <span className={styles.badge}>Featured</span>}
        </span>
        <span className={styles.templateBody}>
          <span className={styles.templateTitle}>{pack.title}</span>
          <span className={styles.templateDesc}>{pack.description}</span>
          <span className={styles.templateMeta}>
            {pack.itemCount} items · {pack.category}
          </span>
        </span>
      </button>
    </li>
  )
}

function Thumb({ hash }: { hash: string }) {
  const url = useImageUrl(hash)
  return url ? <img src={url} alt="" /> : <span />
}

function BoardCard({ board }: { board: BoardSummary }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <li className={styles.boardCard}>
      <Link to={boardPath(board.id)} className={styles.boardLink}>
        <span className={styles.mosaic} aria-hidden data-count={board.preview.length}>
          {board.preview.length ? (
            board.preview.map((h) => <Thumb key={h} hash={h} />)
          ) : (
            <span className={styles.egg} />
          )}
        </span>
        <span className={styles.boardTitle}>{board.title}</span>
        <span className={styles.boardMeta}>
          {board.itemCount} items, {board.rankedCount} ranked · {dateFmt.format(board.updatedAt)}
        </span>
      </Link>
      <div className={styles.boardActions}>
        {confirming ? (
          <button
            type="button"
            className={btn.button}
            data-variant="danger"
            data-size="sm"
            onBlur={() => setConfirming(false)}
            onClick={() => {
              void useBoardStore.getState().deleteBoard(board.id)
              ui().toast({ message: `Deleted “${board.title}”.` })
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
            aria-label={`Delete ${board.title}`}
            title="Delete"
            onClick={() => setConfirming(true)}
          >
            <Trash size={16} aria-hidden />
          </button>
        )}
      </div>
    </li>
  )
}

/** A little hand-made tier list that floats beside the headline. */
function HeroArt() {
  const rows: [string, string, number][] = [
    ['S', '#D9694A', 2],
    ['A', '#E9A23B', 4],
    ['B', '#D8C25A', 3],
    ['C', '#9DB37A', 1],
  ]
  const eggs = [
    '#E9A23B',
    '#7EAE9C',
    '#D98CA0',
    '#ABA0CF',
    '#C8B9A6',
    '#8DB4CF',
    '#9DB37A',
    '#D8C25A',
  ]
  let n = 0
  return (
    <div className={styles.art} aria-hidden>
      <div className={styles.artCard}>
        {rows.map(([label, color, count]) => (
          <div key={label} className={styles.artRow}>
            <span className={styles.artLabel} style={{ background: color }}>
              {label}
            </span>
            {Array.from({ length: count }, () => {
              const i = n++
              return (
                <span
                  key={i}
                  className={styles.artEgg}
                  style={{ '--egg': eggs[i % eggs.length], '--i': i } as React.CSSProperties}
                />
              )
            })}
          </div>
        ))}
      </div>
      <Hen size={64} mood="peck" className={styles.artHen} />
    </div>
  )
}
