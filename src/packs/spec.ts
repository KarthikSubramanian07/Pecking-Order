/**
 * Runtime parsing of pack files fetched from /packs/<id>.json.
 *
 * Packs are validated strictly at build time (scripts/pack-validate.mjs), but
 * what arrives over the network is still input: a stale cache, a proxy or a
 * hand-edited deploy could serve anything. This parser is deliberately
 * forgiving, it keeps every well-formed item and drops the rest, so one bad
 * entry never costs the user a whole pack.
 */
import { clampText, MAX_LABEL, MAX_TIERS, MAX_TITLE } from '@/core/board'
import type { PackItemSpec, PackSpec } from './types'

export const PACK_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Must match ALLOWED_IMAGE_HOSTS in scripts/pack-validate.mjs (a test enforces it). */
export const ALLOWED_IMAGE_HOSTS: readonly string[] = [
  'upload.wikimedia.org',
  'thumb.wikimedia.org',
  'raw.githubusercontent.com',
  'covers.openlibrary.org',
  'www.themealdb.com',
  'static.tvmaze.com',
]

const MAX_PACK_ITEMS = 150
const COMMONS_RE = /^File:[^#<>[\]|{}/]+\.(?:jpe?g|png|gif|svg|webp|tiff?)$/i

type Json = Record<string, unknown>
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown, max: number): string => (typeof v === 'string' ? clampText(v, max) : '')

export function isAllowedImageUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && ALLOWED_IMAGE_HOSTS.includes(url.hostname)
  } catch {
    return false
  }
}

function parseItem(raw: unknown): PackItemSpec | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || !PACK_ID_RE.test(raw.id)) return null
  const label = text(raw.label, MAX_LABEL)
  if (!label) return null
  const item: PackItemSpec = { id: raw.id, label }
  // Only one image source survives, in the same precedence the resolver uses.
  if (typeof raw.wikipedia === 'string' && raw.wikipedia.trim()) {
    item.wikipedia = raw.wikipedia.trim()
  } else if (typeof raw.commons === 'string' && COMMONS_RE.test(raw.commons)) {
    item.commons = raw.commons
  } else if (typeof raw.image === 'string' && isAllowedImageUrl(raw.image)) {
    item.image = raw.image
  }
  return item
}

/** Turns untrusted JSON into a PackSpec, or throws if it is not a usable pack. */
export function parsePack(input: unknown): PackSpec {
  if (!isObj(input)) throw new Error('Invalid pack: not an object')
  if (typeof input.id !== 'string' || !PACK_ID_RE.test(input.id)) {
    throw new Error('Invalid pack: bad id')
  }
  const title = text(input.title, MAX_TITLE)
  if (!title) throw new Error('Invalid pack: missing title')

  const items: PackItemSpec[] = []
  const seen = new Set<string>()
  for (const raw of Array.isArray(input.items) ? input.items.slice(0, MAX_PACK_ITEMS) : []) {
    const item = parseItem(raw)
    if (item && !seen.has(item.id)) {
      seen.add(item.id)
      items.push(item)
    }
  }
  if (items.length === 0) throw new Error('Invalid pack: no items')

  const pack: PackSpec = {
    id: input.id,
    version: text(input.version, 32) || '0.0.0',
    title,
    description: text(input.description, 280),
    category: text(input.category, 32),
    author: text(input.author, 80),
    items,
  }
  const accent = text(input.accent, 32)
  if (accent) pack.accent = accent
  if (Array.isArray(input.tiers)) {
    const tiers = input.tiers
      .slice(0, MAX_TIERS)
      .map((t) => text(t, MAX_LABEL))
      .filter(Boolean)
    if (tiers.length > 0) pack.tiers = tiers
  }
  return pack
}
