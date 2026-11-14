/**
 * Turns untrusted JSON (imported .peck files, share links, old saves) into a
 * well-formed Board. Unknown fields are dropped, strings are clamped, colours
 * and hashes are format-checked, and placement is repaired so every item is
 * placed exactly once. Never trust input that crossed a file or URL boundary.
 */
import { assertValidBoard, clampText, MAX_ITEMS, MAX_LABEL, MAX_TIERS, MAX_TITLE } from './board'
import { isSafeKey, newId } from './ids'
import { swatchAt } from './palette'
import { type Board, COOP, type ImageCredit, type Item, type Tier } from './types'

const ID_RE = /^[a-z]_[0-9a-z]{6,32}$|^[\w-]{1,64}$/i
const HASH_RE = /^[0-9a-f]{64}$/
const PROVIDERS = new Set<ImageCredit['provider']>([
  'upload',
  'paste',
  'url',
  'openverse',
  'wikimedia',
  'wikipedia',
  'pack',
])

export { MAX_ITEMS }

type Json = Record<string, unknown>
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, max: number, fallback = ''): string =>
  typeof v === 'string' ? clampText(v, max) : fallback

/** Well-formed and never a key that Object.prototype owns (see `isSafeKey`). */
function isSafeId(v: unknown): v is string {
  return typeof v === 'string' && ID_RE.test(v) && isSafeKey(v)
}

const safeId = (v: unknown, prefix: 't' | 'i' | 'b'): string => (isSafeId(v) ? v : newId(prefix))

/** Only http(s) links survive, no javascript:, data: or other schemes. */
export function safeHttpUrl(v: unknown): string | undefined {
  if (typeof v !== 'string' || v.length > 2048) return undefined
  try {
    const u = new URL(v)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : undefined
  } catch {
    return undefined
  }
}

/**
 * Credits arrive from imported files and from search APIs, and `sourceUrl`
 * ends up as a link's href: keep http(s) only and bound every string.
 */
export function parseCredit(v: unknown): ImageCredit | undefined {
  if (!isObj(v) || !PROVIDERS.has(v.provider as ImageCredit['provider'])) return undefined
  const credit: ImageCredit = { provider: v.provider as ImageCredit['provider'] }
  const sourceUrl = safeHttpUrl(v.sourceUrl)
  if (sourceUrl) credit.sourceUrl = sourceUrl
  if (typeof v.author === 'string') credit.author = clampText(v.author, 200)
  if (typeof v.license === 'string') credit.license = clampText(v.license, 80)
  return credit
}

/**
 * Tier colours go straight into a CSS custom property and the canvas, so only
 * an exact `#rgb` / `#rrggbb` survives: no whitespace, no missing `#`.
 */
const STRICT_HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
const strictHex = (v: unknown): string | undefined =>
  typeof v === 'string' && STRICT_HEX_RE.test(v) ? v : undefined

export function parseBoard(input: unknown): Board {
  if (!isObj(input)) throw new Error('Invalid board: not an object')
  if (input.v !== 1) throw new Error(`Invalid board: unsupported version ${String(input.v)}`)

  const tiers: Tier[] = []
  const tierIds = new Set<string>()
  for (const raw of Array.isArray(input.tiers) ? input.tiers.slice(0, MAX_TIERS) : []) {
    if (!isObj(raw)) continue
    let id = safeId(raw.id, 't')
    if (id === COOP || tierIds.has(id)) id = newId('t')
    tierIds.add(id)
    tiers.push({
      id,
      label: str(raw.label, MAX_LABEL, '?') || '?',
      color: strictHex(raw.color) ?? swatchAt(tiers.length),
    })
  }

  const items: Record<string, Item> = {}
  const rawItems = isObj(input.items) ? Object.values(input.items).slice(0, MAX_ITEMS) : []
  const idMap = new Map<string, string>()
  for (const raw of rawItems) {
    if (!isObj(raw)) continue
    const original = typeof raw.id === 'string' ? raw.id : ''
    const id = isSafeId(original) && !Object.hasOwn(items, original) ? original : newId('i')
    if (original) idMap.set(original, id)
    const item: Item = { id, label: str(raw.label, MAX_LABEL) }
    if (typeof raw.image === 'string' && HASH_RE.test(raw.image)) item.image = raw.image
    const credit = parseCredit(raw.credit)
    if (credit) item.credit = credit
    if (typeof raw.packItemId === 'string') item.packItemId = clampText(raw.packItemId, 80)
    items[id] = item
  }

  const placement: Record<string, string[]> = { [COOP]: [] }
  for (const t of tiers) placement[t.id] = []
  const placed = new Set<string>()
  const rawPlacement = isObj(input.placement) ? input.placement : {}
  for (const cid of [...tiers.map((t) => t.id), COOP]) {
    const list = Object.hasOwn(rawPlacement, cid) ? rawPlacement[cid] : undefined
    if (!Array.isArray(list)) continue
    for (const rawId of list) {
      const id = typeof rawId === 'string' ? idMap.get(rawId) : undefined
      if (id && Object.hasOwn(items, id) && !placed.has(id)) {
        placement[cid]?.push(id)
        placed.add(id)
      }
    }
  }
  // Anything unplaced lands in the coop rather than vanishing.
  for (const id of Object.keys(items)) if (!placed.has(id)) placement[COOP]?.push(id)

  const now = Date.now()
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : now)
  const board: Board = {
    v: 1,
    id: safeId(input.id, 'b'),
    title: str(input.title, MAX_TITLE, 'Untitled pecking order') || 'Untitled pecking order',
    tiers,
    items,
    placement,
    createdAt: num(input.createdAt),
    updatedAt: num(input.updatedAt),
  }
  if (
    isObj(input.pack) &&
    typeof input.pack.id === 'string' &&
    typeof input.pack.version === 'string'
  ) {
    board.pack = { id: clampText(input.pack.id, 64), version: clampText(input.pack.version, 32) }
  }
  assertValidBoard(board)
  return board
}
