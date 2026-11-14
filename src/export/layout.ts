/**
 * Export layout: board + options → positioned rectangles and fitted text.
 *
 * Pure on purpose. All text measurement goes through the injected `measure`
 * callback, so this file never touches a canvas or the DOM and the whole
 * geometry (tile sizing, wrapping, pixel caps) is unit-testable.
 */
import { type Board, COOP, type ImageHash, type ItemId } from '@/core/types'
import type { ExportFormat, ExportOptions } from './render'
import { ellipsize, type FittedText, fitText, type Measure, wrapText } from './text'
import { font } from './theme'

/** iOS Safari refuses canvases above ~16.7 megapixels. */
export const MAX_PIXELS = 16_700_000
/** Longest canvas side every current engine accepts. */
const MAX_SIDE = 16_384

export const TILE_MIN = 56
export const TILE_MAX = 120
/** Tile size for formats whose height grows with content. */
export const TILE_FLEX = 104
/** In `auto`, only switch to 4:5 if tiles stay at least this big. */
const AUTO_PORTRAIT_MIN_TILE = 80

export const SITE_URL = 'pecking-order.pages.dev'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Lines of text with the alphabetic baseline of each line precomputed. */
export interface TextBlock {
  lines: string[]
  font: string
  size: number
  /** Anchor x; meaning depends on `align`. */
  x: number
  baselines: number[]
  align: 'left' | 'center' | 'right'
}

export interface TileLayout extends Rect {
  itemId: ItemId
  image?: ImageHash
  /** Centred label, used for text items, and as a fallback if the image fails. */
  text: TextBlock
  /** One-line label strip over the image (only when `showLabels`). */
  caption?: TextBlock
}

interface RowLayout extends Rect {
  kind: 'tier' | 'coop'
  /** Tier colour; null for the coop. */
  color: string | null
  labelBox: Rect
  label: TextBlock
  tiles: TileLayout[]
  /** First tile slot of an empty tier, for the egg-outline hint. */
  emptySlot: Rect | null
}

export interface Layout {
  format: Exclude<ExportFormat, 'auto'>
  /** CSS-pixel size; the canvas backing store is this × `scale`. */
  width: number
  height: number
  scale: number
  tile: number
  radius: { row: number; label: number; tile: number }
  title: TextBlock
  underline: { x: number; y: number; w: number; thickness: number }
  meta: TextBlock
  rows: RowLayout[]
  footer: { hen: Rect; url: TextBlock }
}

interface Frame {
  format: Exclude<ExportFormat, 'auto'>
  width: number
  /** Fixed canvas height; absent means the height grows with content. */
  fixedHeight?: number
  minHeight: number
  side: number
  top: number
  bottom: number
  /** Proportional scale relative to the 1200px reference design. */
  k: number
}

const FRAMES: Record<Frame['format'], Frame> = {
  wide: { format: 'wide', width: 1200, minHeight: 675, side: 64, top: 64, bottom: 52, k: 1 },
  portrait: {
    format: 'portrait',
    width: 1080,
    fixedHeight: 1350,
    minHeight: 1350,
    side: 58,
    top: 64,
    bottom: 52,
    k: 0.9,
  },
  // Stories overlay the top ~10% and bottom ~12% with app chrome: keep clear.
  story: {
    format: 'story',
    width: 1080,
    fixedHeight: 1920,
    minHeight: 1920,
    side: 58,
    top: 200,
    bottom: 220,
    k: 0.9,
  },
}

/** Underline sits this far below the last title baseline (× font size), clearing descenders. */
const UNDERLINE_DROP = 0.3
/** Meta line baseline below the underline, in reference px. */
const META_DROP = 36
const META_SIZE = 19

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

interface Container {
  kind: 'tier' | 'coop'
  label: string
  color: string | null
  items: ItemId[]
}

export function computeLayout(board: Board, opts: ExportOptions, measure: Measure): Layout {
  const ctx = prepare(board, opts)
  if (opts.format === 'wide') return place(ctx, FRAMES.wide, TILE_FLEX, measure)
  if (opts.format === 'auto') {
    const wide = place(ctx, FRAMES.wide, TILE_FLEX, measure)
    if (wide.height <= wide.width * 0.75) return wide
    // Tall content reads better as a 4:5 feed post, if tiles stay legible.
    return fitFixed(ctx, FRAMES.portrait, AUTO_PORTRAIT_MIN_TILE, measure) ?? wide
  }
  const frame = FRAMES[opts.format]
  // Never drop items: if even the smallest tile overflows, let the canvas grow.
  return (
    fitFixed(ctx, frame, TILE_MIN, measure) ??
    place(ctx, { ...frame, fixedHeight: undefined }, TILE_MIN, measure)
  )
}

interface Prepared {
  board: Board
  opts: ExportOptions
  containers: Container[]
  /** Any tier label longer than two characters needs a wider label block. */
  longLabels: boolean
  /** Items that appear in the image (ranked, plus the coop when shown). */
  shown: number
}

function prepare(board: Board, opts: ExportOptions): Prepared {
  const present = (ids: ItemId[] | undefined) => (ids ?? []).filter((id) => board.items[id])
  const containers: Container[] = board.tiers.map((t) => ({
    kind: 'tier',
    label: t.label.trim() || '?',
    color: t.color,
    items: present(board.placement[t.id]),
  }))
  const coop = present(board.placement[COOP])
  if (opts.includeCoop && coop.length > 0) {
    containers.push({ kind: 'coop', label: 'Unranked', color: null, items: coop })
  }
  const longLabels = containers.some((c) => c.kind === 'coop' || [...c.label].length > 2)
  const shown = containers.reduce((n, c) => n + c.items.length, 0)
  return { board, opts, containers, longLabels, shown }
}

/** Largest tile in [minTile, TILE_MAX] whose content fits the fixed height. */
function fitFixed(ctx: Prepared, frame: Frame, minTile: number, measure: Measure): Layout | null {
  const height = frame.fixedHeight ?? frame.minHeight
  const header = headerHeight(ctx, frame, measure)
  for (let tile = TILE_MAX; tile >= minTile; tile -= 2) {
    const natural = frame.top + header + rowsHeight(ctx, frame, tile) + footerSpace(frame)
    if (natural <= height) return place(ctx, frame, tile, measure)
  }
  return null
}

// ─── Geometry ─────────────────────────────────────────────────────────────

interface RowMetrics {
  pad: number
  gap: number
  labelW: number
  labelGap: number
  rowGap: number
  perLine: number
}

function rowMetrics(ctx: Prepared, frame: Frame, tile: number): RowMetrics {
  const pad = clamp(Math.round(tile * 0.06), 4, 8)
  const gap = pad
  const labelW = ctx.longLabels ? clamp(Math.round(tile * 1.3), 88, 148) : tile
  const labelGap = Math.round(pad * 1.5)
  const rowW = frame.width - frame.side * 2
  const tilesW = rowW - pad - labelW - labelGap - pad
  const perLine = Math.max(1, Math.floor((tilesW + gap) / (tile + gap)))
  return { pad, gap, labelW, labelGap, rowGap: Math.round(10 * frame.k), perLine }
}

function rowHeight(count: number, tile: number, m: RowMetrics): number {
  const lines = Math.max(1, Math.ceil(count / m.perLine))
  return m.pad * 2 + lines * tile + (lines - 1) * m.gap
}

/** The coop sits a little apart: it is outside the ranking, not its last tier. */
function gapBefore(c: Container, index: number, m: RowMetrics): number {
  if (index === 0) return 0
  return c.kind === 'coop' ? m.rowGap * 3 : m.rowGap
}

function rowsHeight(ctx: Prepared, frame: Frame, tile: number): number {
  const m = rowMetrics(ctx, frame, tile)
  return ctx.containers.reduce(
    (sum, c, i) => sum + gapBefore(c, i, m) + rowHeight(c.items.length, tile, m),
    0,
  )
}

function footerSpace(frame: Frame): number {
  return Math.round(36 * frame.k) + Math.round(28 * frame.k) + frame.bottom
}

// ─── Header ───────────────────────────────────────────────────────────────

interface Header {
  title: FittedText
  height: number
}

function fitTitle(ctx: Prepared, frame: Frame, measure: Measure): FittedText {
  const k = frame.k
  const text = ctx.board.title.trim() || 'Untitled pecking order'
  const maxWidth = frame.width - frame.side * 2
  const base = { text, maxWidth, font: font.display, leading: 1.04, measure }
  // Prefer one confident line; only wrap when that would get too small.
  const oneLine = fitText({
    ...base,
    maxLines: 1,
    maxHeight: Infinity,
    maxSize: 80 * k,
    minSize: 62 * k,
  })
  if (!oneLine.clipped) return oneLine
  return fitText({ ...base, maxLines: 2, maxHeight: Infinity, maxSize: 72 * k, minSize: 56 * k })
}

function header(ctx: Prepared, frame: Frame, measure: Measure): Header {
  const title = fitTitle(ctx, frame, measure)
  const k = frame.k
  const titleH = title.size * 0.78 + (title.lines.length - 1) * title.lineHeight
  // underline gap + stroke + meta line
  const height =
    titleH + title.size * UNDERLINE_DROP + Math.round(META_DROP * k) + Math.round(6 * k)
  return { title, height }
}

function headerHeight(ctx: Prepared, frame: Frame, measure: Measure): number {
  return header(ctx, frame, measure).height + Math.round(32 * frame.k)
}

/** Sentence case, as a person would write it: "ranked by @you · 14 items · November 2026". */
function metaText(ctx: Prepared): string {
  const d = new Date(ctx.board.updatedAt)
  const parts = [
    ctx.opts.byline?.trim(),
    `${ctx.shown} ${ctx.shown === 1 ? 'item' : 'items'}`,
    `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
  ]
  return parts.filter((p): p is string => Boolean(p)).join(' · ')
}

// ─── Placement ────────────────────────────────────────────────────────────

function place(ctx: Prepared, frame: Frame, tile: number, measure: Measure): Layout {
  const k = frame.k
  const left = frame.side
  const contentW = frame.width - frame.side * 2
  const head = header(ctx, frame, measure)
  const headGap = Math.round(32 * k)
  const rowsH = rowsHeight(ctx, frame, tile)
  const natural = frame.top + head.height + headGap + rowsH + footerSpace(frame)
  const height = frame.fixedHeight ?? Math.max(frame.minHeight, Math.ceil(natural))
  // Spare room goes mostly below the content so it sits slightly above centre.
  const slack = Math.max(0, height - natural)
  let y = frame.top + Math.round(slack * 0.4)

  const t = head.title
  const titleBaselines = t.lines.map((_, i) => y + t.size * 0.78 + i * t.lineHeight)
  const lastBaseline = titleBaselines[titleBaselines.length - 1] ?? y
  const widest = Math.max(...t.lines.map((l) => measure(l, t.font)))
  const underline = {
    x: left,
    y: lastBaseline + t.size * UNDERLINE_DROP,
    w: clamp(widest * 0.4, 80 * k, contentW),
    thickness: 5 * k,
  }
  const metaSize = META_SIZE * k
  const metaFont = font.displayItalic(metaSize)
  const meta = {
    lines: [ellipsize(metaText(ctx), contentW, metaFont, measure)],
    font: metaFont,
    size: metaSize,
    x: left,
    baselines: [underline.y + Math.round(META_DROP * k)],
    align: 'left' as const,
  }
  y += head.height + headGap

  const m = rowMetrics(ctx, frame, tile)
  const rows: RowLayout[] = []
  ctx.containers.forEach((c, i) => {
    y += gapBefore(c, i, m)
    const h = rowHeight(c.items.length, tile, m)
    rows.push(placeRow(ctx, c, { x: left, y, w: contentW, h }, tile, m, measure))
    y += h
  })

  const henSize = Math.round(28 * k)
  const henY = height - frame.bottom - henSize
  const urlSize = 13 * k
  const footer = {
    hen: { x: frame.width - frame.side - henSize, y: henY, w: henSize, h: henSize },
    url: {
      lines: [SITE_URL],
      font: font.ui(urlSize, 500),
      size: urlSize,
      x: frame.width - frame.side - henSize - Math.round(10 * k),
      baselines: [henY + henSize / 2 + urlSize * 0.35],
      align: 'right' as const,
    },
  }

  return {
    format: frame.format,
    width: frame.width,
    height,
    scale: effectiveScale(ctx.opts.scale, frame.width, height),
    tile,
    radius: { row: 14, label: 10, tile: Math.min(10, Math.round(tile * 0.1)) },
    title: {
      lines: t.lines,
      font: t.font,
      size: t.size,
      x: left,
      baselines: titleBaselines,
      align: 'left',
    },
    underline,
    meta,
    rows,
    footer,
  }
}

function placeRow(
  ctx: Prepared,
  c: Container,
  row: Rect,
  tile: number,
  m: RowMetrics,
  measure: Measure,
): RowLayout {
  const labelBox = { x: row.x + m.pad, y: row.y + m.pad, w: m.labelW, h: row.h - m.pad * 2 }
  const startX = labelBox.x + labelBox.w + m.labelGap
  const tiles = c.items.map((id, i) => {
    const col = i % m.perLine
    const line = Math.floor(i / m.perLine)
    const rect = {
      x: startX + col * (tile + m.gap),
      y: row.y + m.pad + line * (tile + m.gap),
      w: tile,
      h: tile,
    }
    return placeTile(ctx, id, rect, measure)
  })
  return {
    ...row,
    kind: c.kind,
    color: c.color,
    labelBox,
    label: tierLabel(c, labelBox, measure),
    tiles,
    emptySlot:
      c.items.length === 0 && c.kind === 'tier'
        ? { x: startX, y: labelBox.y, w: tile, h: tile }
        : null,
  }
}

function tierLabel(c: Container, box: Rect, measure: Measure): TextBlock {
  const short = c.kind === 'tier' && [...c.label].length <= 2
  const inset = Math.max(6, Math.round(box.w * 0.08))
  const fitted = short
    ? fitText({
        text: c.label,
        maxWidth: box.w - inset * 2,
        maxHeight: box.h - inset * 2,
        maxLines: 1,
        maxSize: Math.min(box.w, box.h, 120) * 0.5,
        minSize: 12,
        font: (s) => font.display(s, 560),
        leading: 1,
        measure,
      })
    : fitText({
        text: c.label,
        maxWidth: box.w - inset * 2,
        maxHeight: box.h - inset * 2,
        maxLines: c.kind === 'coop' ? 1 : 3,
        maxSize: c.kind === 'coop' ? 16 : clamp(box.w * 0.16, 13, 22),
        minSize: 10,
        font: (s) => font.ui(s, 600),
        leading: 1.12,
        measure,
      })
  return centred(fitted, box)
}

function placeTile(ctx: Prepared, id: ItemId, rect: Rect, measure: Measure): TileLayout {
  const item = ctx.board.items[id]
  const label = item?.label.trim() || 'Untitled'
  const inset = Math.max(5, Math.round(rect.w * 0.09))
  const fitted = fitText({
    text: label,
    maxWidth: rect.w - inset * 2,
    maxHeight: rect.h - inset * 2,
    maxLines: 4,
    maxSize: clamp(rect.w * 0.15, 10, 17),
    minSize: clamp(rect.w * 0.1, 8, 10),
    font: (s) => font.ui(s, 600),
    leading: 1.14,
    measure,
  })
  const tile: TileLayout = { ...rect, itemId: id, text: centred(fitted, rect) }
  if (item?.image) {
    tile.image = item.image
    if (ctx.opts.showLabels) {
      const size = clamp(rect.w * 0.12, 9, 13)
      const f = font.ui(size, 600)
      const capInset = Math.max(5, Math.round(rect.w * 0.07))
      tile.caption = {
        lines: [wrapText(label, rect.w - capInset * 2, f, measure, 1).lines[0] ?? ''],
        font: f,
        size,
        x: rect.x + rect.w / 2,
        baselines: [rect.y + rect.h - capInset - size * 0.1],
        align: 'center',
      }
    }
  }
  return tile
}

/** Centres fitted lines in a box, baseline-corrected for optical middle. */
function centred(t: FittedText, box: Rect): TextBlock {
  const total = t.lines.length * t.lineHeight
  const top = box.y + (box.h - total) / 2
  return {
    lines: t.lines,
    font: t.font,
    size: t.size,
    x: box.x + box.w / 2,
    baselines: t.lines.map((_, i) => top + i * t.lineHeight + t.lineHeight / 2 + t.size * 0.35),
    align: 'center',
  }
}

/** Device-pixel multiplier clamped to 1–3, then lowered to respect canvas limits. */
export function effectiveScale(requested: number, width: number, height: number): number {
  const wanted = clamp(Number.isFinite(requested) ? requested : 1, 1, 3)
  const byArea = Math.sqrt(MAX_PIXELS / (width * height))
  const bySide = MAX_SIDE / Math.max(width, height)
  return Math.floor(Math.min(wanted, byArea, bySide) * 100) / 100
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}
