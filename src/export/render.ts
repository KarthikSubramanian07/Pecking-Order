/**
 * Shareable PNG export, drawn by hand on Canvas 2D from board data.
 *
 * DOM-capture libraries (html2canvas & co.) blur or blank out on Safari,
 * choke on modern CSS colour functions and taint on cross-origin images.
 * Drawing ourselves avoids all three: every item image is a local Blob
 * decoded with createImageBitmap, so the canvas can never be tainted.
 */
import frauncesItalicLatinExt from '@fontsource-variable/fraunces/files/fraunces-latin-ext-full-italic.woff2?url'
import frauncesItalicLatin from '@fontsource-variable/fraunces/files/fraunces-latin-full-italic.woff2?url'
import { HEN_PATHS, HEN_STROKE_WIDTH, HEN_VIEWBOX } from '@/brand/hen'
import type { Board, ImageHash } from '@/core/types'
import { getImage } from '@/storage/db'
import { GRAIN_TILE, grainPixels, hashString, seededRandom } from './grain'
import {
  computeLayout,
  type Layout,
  type Rect,
  SITE_URL,
  type TextBlock,
  type TileLayout,
} from './layout'
import type { Measure } from './text'
import { type ExportPalette, font, mixHex, PALETTES } from './theme'

export type ExportFormat = 'auto' | 'wide' | 'portrait' | 'story'
export type ExportTheme = 'light' | 'dark'

export interface ExportOptions {
  format: ExportFormat
  theme: ExportTheme
  /** Device pixel multiplier, 1–3. */
  scale: number
  showLabels: boolean
  /** Include the unranked coop at the bottom. */
  includeCoop: boolean
  /** Optional subtitle line, e.g. "ranked by @hen". */
  byline?: string
}

export const DEFAULT_EXPORT: ExportOptions = {
  format: 'auto',
  theme: 'light',
  scale: 2,
  showLabels: true,
  includeCoop: false,
}

export interface RenderDeps {
  /** Decodes an item image. Resolve `undefined` to fall back to a text tile. */
  loadImage: (hash: ImageHash) => Promise<ImageBitmap | undefined>
}

type Canvas = HTMLCanvasElement | OffscreenCanvas
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

const FONT_TIMEOUT_MS = 2500

/** Unicode ranges mirror @fontsource-variable/fraunces/full-italic.css. */
const ITALIC_FACES: [url: string, unicodeRange: string][] = [
  [
    frauncesItalicLatin,
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  ],
  [
    frauncesItalicLatinExt,
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  ],
]
let italicRegistered = false

export async function renderBoardImage(
  board: Board,
  opts: ExportOptions,
  deps: Partial<RenderDeps> = {},
): Promise<Blob> {
  const loadImage = deps.loadImage ?? loadStoredImage
  await loadFonts(board, opts)

  const measure = createMeasure()
  const layout = computeLayout(board, opts, measure)
  const images = await loadImages(layout, loadImage)
  try {
    const canvas = createCanvas(
      Math.floor(layout.width * layout.scale),
      Math.floor(layout.height * layout.scale),
    )
    const ctx = context2d(canvas)
    ctx.scale(layout.scale, layout.scale)
    drawLayout(ctx, layout, PALETTES[opts.theme], images, hashString(board.title))
    return await toPng(canvas)
  } finally {
    for (const bitmap of images.values()) bitmap.close?.()
  }
}

// ─── Resources ────────────────────────────────────────────────────────────

async function loadStoredImage(hash: ImageHash): Promise<ImageBitmap | undefined> {
  const stored = await getImage(hash)
  return stored ? createImageBitmap(stored.blob) : undefined
}

async function loadImages(
  layout: Layout,
  load: RenderDeps['loadImage'],
): Promise<Map<ImageHash, ImageBitmap>> {
  const hashes = new Set<ImageHash>()
  for (const row of layout.rows) for (const t of row.tiles) if (t.image) hashes.add(t.image)
  const out = new Map<ImageHash, ImageBitmap>()
  await Promise.all(
    [...hashes].map(async (hash) => {
      try {
        const bitmap = await load(hash)
        if (bitmap) out.set(hash, bitmap)
      } catch {
        // A broken image becomes a text tile rather than failing the export.
      }
    }),
  )
  return out
}

/**
 * Canvas text silently falls back if a face isn't loaded yet, so warm every
 * face we draw with — passing the real text so unicode-range subsets load too.
 */
async function loadFonts(board: Board, opts: ExportOptions): Promise<void> {
  const fonts = typeof document === 'undefined' ? undefined : document.fonts
  if (!fonts?.load) return
  registerFrauncesItalic(fonts)
  const text = [
    board.title,
    opts.byline ?? '',
    SITE_URL,
    'Unranked items 0123456789 · … January February March April May June July August September October November December',
    ...board.tiers.map((t) => t.label),
    ...Object.values(board.items).map((i) => i.label),
  ].join(' ')
  const faces = [
    font.display(16),
    font.display(16, 560),
    font.displayItalic(16),
    font.ui(16, 600),
    font.ui(16, 500),
  ]
  const loads = Promise.allSettled(faces.map((f) => fonts.load(f, text)))
  await Promise.race([loads, new Promise((r) => setTimeout(r, FONT_TIMEOUT_MS))])
}

/**
 * The app stylesheet only ships upright Fraunces. Register the real italic on
 * first export so the meta line isn't a synthesised slant. Fetched lazily.
 */
function registerFrauncesItalic(fonts: FontFaceSet): void {
  if (italicRegistered || typeof FontFace === 'undefined') return
  italicRegistered = true
  for (const [url, unicodeRange] of ITALIC_FACES) {
    fonts.add(
      new FontFace('Fraunces Variable', `url(${url}) format('woff2')`, {
        style: 'italic',
        weight: '100 900',
        unicodeRange,
      }),
    )
  }
}

function createMeasure(): Measure {
  const ctx = context2d(createCanvas(1, 1))
  const cache = new Map<string, number>()
  return (text, f) => {
    const key = `${f}\n${text}`
    let w = cache.get(key)
    if (w === undefined) {
      ctx.font = f
      w = ctx.measureText(text).width
      cache.set(key, w)
    }
    return w
  }
}

function createCanvas(width: number, height: number): Canvas {
  // Prefer a DOM canvas on the main thread: it always sees document fonts.
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas')
    c.width = width
    c.height = height
    return c
  }
  return new OffscreenCanvas(width, height)
}

function context2d(canvas: Canvas): Ctx {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is not available')
  return ctx as Ctx
}

function toPng(canvas: Canvas): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/png' })
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))),
      'image/png',
    ),
  )
}

// ─── Drawing ──────────────────────────────────────────────────────────────

function drawLayout(
  ctx: Ctx,
  layout: Layout,
  p: ExportPalette,
  images: Map<ImageHash, ImageBitmap>,
  seed: number,
): void {
  ctx.fillStyle = p.paper
  ctx.fillRect(0, 0, layout.width, layout.height)
  drawGrain(ctx, layout, p.grain)

  ctx.fillStyle = p.ink
  drawText(ctx, layout.title)
  drawUnderline(ctx, layout.underline, p.accent, seed)

  ctx.fillStyle = p.muted
  drawText(ctx, layout.meta)

  for (const row of layout.rows) {
    if (row.kind === 'tier' && row.color) {
      fillRoundRect(ctx, row, layout.radius.row, mixHex(p.sunken, row.color, p.tint))
      fillRoundRect(ctx, row.labelBox, layout.radius.label, row.color)
    } else {
      drawCoopFrame(ctx, row, layout.radius.row, p)
      fillRoundRect(ctx, row.labelBox, layout.radius.label, p.hairline)
    }
    ctx.fillStyle = row.kind === 'tier' ? p.tierInk : p.muted
    drawText(ctx, row.label)
    if (row.emptySlot) drawEggHint(ctx, row.emptySlot, p.muted)
    for (const tile of row.tiles) {
      const bitmap = tile.image ? images.get(tile.image) : undefined
      if (bitmap) drawImageTile(ctx, tile, bitmap, layout.radius.tile, p)
      else drawTextTile(ctx, tile, layout.radius.tile, p)
    }
  }

  drawHen(ctx, layout.footer.hen, p)
  ctx.globalAlpha = 0.6
  ctx.fillStyle = p.ink
  drawText(ctx, layout.footer.url)
  ctx.globalAlpha = 1
}

function drawText(ctx: Ctx, block: TextBlock): void {
  ctx.font = block.font
  ctx.textAlign = block.align
  ctx.textBaseline = 'alphabetic'
  block.lines.forEach((line, i) => {
    ctx.fillText(line, block.x, block.baselines[i] ?? 0)
  })
}

function drawGrain(ctx: Ctx, layout: Layout, opacity: number): void {
  if (typeof ImageData === 'undefined') return
  const tile = createCanvas(GRAIN_TILE, GRAIN_TILE)
  const tctx = tile.getContext('2d') as Ctx | null
  if (!tctx) return
  tctx.putImageData(new ImageData(grainPixels(), GRAIN_TILE, GRAIN_TILE), 0, 0)
  const pattern = ctx.createPattern(tile, 'repeat')
  if (!pattern) return
  // Undo the layout scale so grain stays one device pixel fine at any export scale.
  if (typeof DOMMatrix !== 'undefined') {
    pattern.setTransform(new DOMMatrix().scaleSelf(1 / layout.scale))
  }
  ctx.save()
  // Crisp specks keep the pattern exactly periodic, which PNG deflate exploits.
  ctx.imageSmoothingEnabled = false
  ctx.globalAlpha = opacity
  ctx.fillStyle = pattern
  ctx.fillRect(0, 0, layout.width, layout.height)
  ctx.restore()
}

/** A marker swipe: one confident stroke plus a lighter second pass, seeded per title. */
function drawUnderline(ctx: Ctx, u: Layout['underline'], color: string, seed: number): void {
  const rand = seededRandom(seed)
  const j = (amp: number) => (rand() - 0.5) * 2 * amp
  const { x, y, w, thickness: t } = u
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = t
  ctx.beginPath()
  ctx.moveTo(x + t / 2, y + j(t * 0.2))
  ctx.bezierCurveTo(
    x + w * 0.32,
    y - t * 0.55 + j(t * 0.2),
    x + w * 0.62,
    y + t * 0.6 + j(t * 0.2),
    x + w - t / 2,
    y - t * 0.35 + j(t * 0.2),
  )
  ctx.stroke()
  ctx.globalAlpha = 0.5
  ctx.lineWidth = t * 0.5
  ctx.beginPath()
  ctx.moveTo(x + w * 0.1, y + t * 0.75 + j(t * 0.15))
  ctx.quadraticCurveTo(
    x + w * 0.5,
    y + t * 0.2 + j(t * 0.2),
    x + w * 0.86,
    y + t * 0.6 + j(t * 0.15),
  )
  ctx.stroke()
  ctx.restore()
}

function drawImageTile(
  ctx: Ctx,
  tile: TileLayout,
  bitmap: ImageBitmap,
  radius: number,
  p: ExportPalette,
): void {
  ctx.save()
  roundRectPath(ctx, tile, radius)
  ctx.clip()
  ctx.fillStyle = p.surface
  ctx.fillRect(tile.x, tile.y, tile.w, tile.h)
  // object-fit: cover — centre-crop the source to the tile's square.
  const s = Math.max(tile.w / bitmap.width, tile.h / bitmap.height)
  const sw = tile.w / s
  const sh = tile.h / s
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(
    bitmap,
    (bitmap.width - sw) / 2,
    (bitmap.height - sh) / 2,
    sw,
    sh,
    tile.x,
    tile.y,
    tile.w,
    tile.h,
  )
  if (tile.caption) {
    const top = tile.y + tile.h * 0.48
    const scrim = ctx.createLinearGradient(0, top, 0, tile.y + tile.h)
    scrim.addColorStop(0, 'rgba(20,16,13,0)')
    scrim.addColorStop(0.55, 'rgba(20,16,13,0.42)')
    scrim.addColorStop(1, 'rgba(20,16,13,0.78)')
    ctx.fillStyle = scrim
    ctx.fillRect(tile.x, top, tile.w, tile.y + tile.h - top)
    ctx.fillStyle = '#FFFFFF'
    drawText(ctx, tile.caption)
  }
  ctx.restore()
  // A hairline edge keeps pale photos from dissolving into the row.
  ctx.save()
  roundRectPath(ctx, inset(tile, 0.5), Math.max(0, radius - 0.5))
  ctx.strokeStyle = p.ink
  ctx.globalAlpha = 0.1
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.restore()
}

function drawTextTile(ctx: Ctx, tile: TileLayout, radius: number, p: ExportPalette): void {
  fillRoundRect(ctx, tile, radius, p.surface)
  ctx.save()
  roundRectPath(ctx, inset(tile, 0.5), Math.max(0, radius - 0.5))
  ctx.strokeStyle = p.hairline
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.restore()
  ctx.fillStyle = p.ink
  drawText(ctx, tile.text)
}

/** Unranked items sit in an open, dashed tray rather than a filled row. */
function drawCoopFrame(ctx: Ctx, row: Rect, radius: number, p: ExportPalette): void {
  ctx.save()
  roundRectPath(ctx, inset(row, 0.75), radius)
  ctx.strokeStyle = p.muted
  ctx.globalAlpha = 0.45
  ctx.lineWidth = 1.5
  ctx.setLineDash([5, 5])
  ctx.stroke()
  ctx.restore()
}

/** Dashed egg in the first slot of an empty tier, so the scale still reads. */
function drawEggHint(ctx: Ctx, slot: Rect, color: string): void {
  const cx = slot.x + slot.w / 2
  const cy = slot.y + slot.h / 2
  const h = slot.h * 0.56
  const rx = h * 0.39
  const top = cy - h / 2
  const bottom = cy + h / 2
  const belly = cy + h * 0.1
  ctx.save()
  ctx.strokeStyle = color
  ctx.globalAlpha = 0.4
  ctx.lineWidth = 1.5
  ctx.setLineDash([3, 4])
  ctx.beginPath()
  ctx.moveTo(cx, top)
  ctx.bezierCurveTo(cx + rx * 0.58, top, cx + rx, cy - h * 0.2, cx + rx, belly)
  ctx.bezierCurveTo(cx + rx, cy + h * 0.38, cx + rx * 0.56, bottom, cx, bottom)
  ctx.bezierCurveTo(cx - rx * 0.56, bottom, cx - rx, cy + h * 0.38, cx - rx, belly)
  ctx.bezierCurveTo(cx - rx, cy - h * 0.2, cx - rx * 0.58, top, cx, top)
  ctx.closePath()
  ctx.stroke()
  ctx.restore()
}

/** The hen watermark: body filled with surface, comb and wattle with accent. */
function drawHen(ctx: Ctx, rect: Rect, p: ExportPalette): void {
  if (typeof Path2D === 'undefined') return
  const s = rect.w / HEN_VIEWBOX
  const paths = HEN_PATHS.map((h) => ({ ...h, path: new Path2D(h.d) }))
  ctx.save()
  ctx.translate(rect.x, rect.y)
  ctx.scale(s, s)
  // Fills first so the outline sits cleanly on top of every shape.
  for (const h of paths) {
    const closed = /z\s*$/i.test(h.d)
    if (!h.fill && !closed) continue
    ctx.fillStyle = h.fill === 'accent' ? p.accent : h.fill === 'ink' ? p.ink : p.surface
    ctx.fill(h.path)
  }
  ctx.strokeStyle = p.ink
  ctx.lineWidth = HEN_STROKE_WIDTH * 1.4
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const h of paths) if (!h.noStroke) ctx.stroke(h.path)
  ctx.restore()
}

function fillRoundRect(ctx: Ctx, r: Rect, radius: number, color: string): void {
  ctx.fillStyle = color
  roundRectPath(ctx, r, radius)
  ctx.fill()
}

/** Hand-rolled with arcTo: ctx.roundRect is missing on older Safari. */
function roundRectPath(ctx: Ctx, r: Rect, radius: number): void {
  const rad = Math.max(0, Math.min(radius, r.w / 2, r.h / 2))
  ctx.beginPath()
  ctx.moveTo(r.x + rad, r.y)
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, rad)
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, rad)
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, rad)
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, rad)
  ctx.closePath()
}

function inset(r: Rect, by: number): Rect {
  return { x: r.x + by, y: r.y + by, w: r.w - by * 2, h: r.h - by * 2 }
}
