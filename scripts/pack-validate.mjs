/**
 * Pure validation rules for contributor packs (packs/<id>/pack.json).
 *
 * This mirrors packs/pack.schema.json by hand so the build needs no
 * dependencies and can print errors a contributor can act on without
 * decoding JSON Pointer paths. Keep the two in sync when a rule changes.
 */

const PACK_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const COMMONS_RE = /^File:[^#<>[\]|{}/]+\.(?:jpe?g|png|gif|svg|webp|tiff?)$/i

const MIN_ITEMS = 3
export const MAX_ITEMS = 150
const MAX_LABEL = 80
const MAX_ID = 64
const MAX_TITLE = 60
const MAX_DESCRIPTION = 140
const MAX_AUTHOR = 80
const MIN_TIERS = 2
const MAX_TIERS = 20
// Longer tier labels wrap badly in the narrow label column of the board.
const MAX_TIER_LABEL = 32
const MAX_TAGS = 10
const MAX_TAG = 32

/** A fixed list keeps the catalog browsable; add to it in the same PR as a new pack. */
export const CATEGORIES = [
  'Animals',
  'Food & Drink',
  'Film & TV',
  'Games',
  'Music',
  'Places',
  'Science & Nature',
  'Sports',
  'Tech',
  'Miscellaneous',
]

/**
 * Hosts a pack may point `image` at directly. Each one serves images with
 * `Access-Control-Allow-Origin: *`, which the app needs to read the pixels.
 * Must match ALLOWED_IMAGE_HOSTS in src/packs/spec.ts (a test enforces it).
 */
export const ALLOWED_IMAGE_HOSTS = [
  'upload.wikimedia.org',
  'thumb.wikimedia.org',
  'raw.githubusercontent.com',
  'covers.openlibrary.org',
  'www.themealdb.com',
  'static.tvmaze.com',
]

const PACK_KEYS = new Set([
  '$schema',
  'id',
  'version',
  'title',
  'description',
  'accent',
  'category',
  'author',
  'tiers',
  'items',
])
const ITEM_KEYS = new Set(['id', 'label', 'wikipedia', 'commons', 'image', 'tags'])
const IMAGE_KEYS = ['wikipedia', 'commons', 'image']

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Folders starting with `_` or `.` (like `_template`) are never built. */
export function isPackFolder(name) {
  return !name.startsWith('_') && !name.startsWith('.')
}

/** Reads swatch names out of src/core/palette.ts so the list has one source of truth. */
export function parseSwatchNames(paletteSource) {
  return [...paletteSource.matchAll(/\{\s*name:\s*'([^']+)',\s*hex:/g)].map((m) => m[1])
}

/**
 * Checks one string field. Returns an error message or null.
 * `required` fields must be present; all strings must be trimmed and non-empty.
 */
function checkString(value, { max, required = true }) {
  if (value === undefined) return required ? 'is required' : null
  if (typeof value !== 'string') return `must be a string (got ${typeof value})`
  if (value.trim() === '') return 'must not be empty'
  if (value !== value.trim()) return 'must not start or end with whitespace'
  if (value.length > max) return `must be at most ${max} characters (got ${value.length})`
  return null
}

function checkId(value, what) {
  const err = checkString(value, { max: MAX_ID })
  if (err) return err
  if (!PACK_ID_RE.test(value)) {
    return `must be kebab-case (lowercase letters, digits and single dashes), e.g. "${what}"`
  }
  return null
}

function checkImageUrl(value) {
  const err = checkString(value, { max: 2048 })
  if (err) return err
  let url
  try {
    url = new URL(value)
  } catch {
    return 'must be an absolute URL'
  }
  if (url.protocol !== 'https:') return 'must use https'
  if (!ALLOWED_IMAGE_HOSTS.includes(url.hostname)) {
    return `host "${url.hostname}" is not allowed; use one of ${ALLOWED_IMAGE_HOSTS.join(', ')} or a "wikipedia"/"commons" reference`
  }
  return null
}

function checkItem(item, index, seenIds, seenLabels) {
  const errors = []
  const where =
    isObject(item) && typeof item.id === 'string' ? `item "${item.id}"` : `items[${index}]`
  const add = (field, msg) => errors.push(`${where} › ${field}: ${msg}`)

  if (!isObject(item)) {
    errors.push(`${where}: must be an object`)
    return errors
  }
  for (const key of Object.keys(item)) {
    if (!ITEM_KEYS.has(key)) add(key, `unknown key (allowed: ${[...ITEM_KEYS].join(', ')})`)
  }

  const idErr = checkId(item.id, 'golden-retriever')
  if (idErr) add('id', idErr)
  else if (seenIds.has(item.id))
    add('id', `duplicate id (also used by items[${seenIds.get(item.id)}])`)
  else seenIds.set(item.id, index)

  const labelErr = checkString(item.label, { max: MAX_LABEL })
  if (labelErr) add('label', labelErr)
  else {
    const key = item.label.toLowerCase()
    if (seenLabels.has(key)) add('label', `duplicate label "${item.label}"`)
    else seenLabels.add(key)
  }

  const sources = IMAGE_KEYS.filter((k) => item[k] !== undefined)
  if (sources.length > 1) {
    add(sources.join('+'), 'use at most one of "wikipedia", "commons" or "image"')
  }
  if (item.wikipedia !== undefined) {
    const err = checkString(item.wikipedia, { max: 255 })
    if (err) add('wikipedia', err)
    else if (/^https?:/i.test(item.wikipedia) || item.wikipedia.includes('/wiki/')) {
      add('wikipedia', 'use the article title (e.g. "Rhode Island Red"), not a URL')
    } else if (/[#<>[\]{}|]/.test(item.wikipedia)) {
      add('wikipedia', 'must be a plain article title without #sections or special characters')
    }
  }
  if (item.commons !== undefined) {
    const err = checkString(item.commons, { max: 255 })
    if (err) add('commons', err)
    else if (!COMMONS_RE.test(item.commons)) {
      add('commons', 'must look like "File:Name.jpg" (jpg, png, gif, svg, webp or tiff)')
    }
  }
  if (item.image !== undefined) {
    const err = checkImageUrl(item.image)
    if (err) add('image', err)
  }

  if (item.tags !== undefined) {
    if (!Array.isArray(item.tags)) add('tags', 'must be an array of strings')
    else {
      if (item.tags.length > MAX_TAGS) add('tags', `must have at most ${MAX_TAGS} tags`)
      const seen = new Set()
      for (const tag of item.tags) {
        if (typeof tag !== 'string' || tag.length > MAX_TAG || !PACK_ID_RE.test(tag)) {
          add('tags', `${JSON.stringify(tag)} must be kebab-case, at most ${MAX_TAG} characters`)
        } else if (seen.has(tag)) add('tags', `duplicate tag "${tag}"`)
        else seen.add(tag)
      }
    }
  }
  return errors
}

/**
 * Validates a parsed pack.json. Returns a list of human-readable problems
 * (empty when the pack is valid). `folder` is the pack's directory name,
 * which must equal its id; `swatchNames` are the allowed `accent` values.
 */
export function validatePack(pack, { folder, swatchNames }) {
  if (!isObject(pack)) return ['pack.json must contain a JSON object']
  const errors = []
  const add = (field, msg) => errors.push(`${field}: ${msg}`)

  for (const key of Object.keys(pack)) {
    if (!PACK_KEYS.has(key)) add(key, `unknown key (allowed: ${[...PACK_KEYS].join(', ')})`)
  }

  const idErr = checkId(pack.id, 'chicken-breeds')
  if (idErr) add('id', idErr)
  else if (folder !== undefined && pack.id !== folder) {
    add('id', `must match its folder name "${folder}" (got "${pack.id}")`)
  }

  if (typeof pack.version !== 'string' || !SEMVER_RE.test(pack.version)) {
    add('version', `must be a semantic version like "1.0.0" (got ${JSON.stringify(pack.version)})`)
  }

  for (const [field, max] of [
    ['title', MAX_TITLE],
    ['description', MAX_DESCRIPTION],
    ['author', MAX_AUTHOR],
  ]) {
    const err = checkString(pack[field], { max })
    if (err) add(field, err)
  }

  if (!CATEGORIES.includes(pack.category)) {
    add(
      'category',
      `must be one of ${CATEGORIES.map((c) => `"${c}"`).join(', ')} (got ${JSON.stringify(pack.category)})`,
    )
  }

  if (pack.accent !== undefined && !swatchNames.includes(pack.accent)) {
    add(
      'accent',
      `must be a palette swatch name: ${swatchNames.join(', ')} (got ${JSON.stringify(pack.accent)})`,
    )
  }

  if (pack.tiers !== undefined) {
    if (!Array.isArray(pack.tiers)) add('tiers', 'must be an array of tier labels')
    else {
      if (pack.tiers.length < MIN_TIERS || pack.tiers.length > MAX_TIERS) {
        add('tiers', `must have ${MIN_TIERS}–${MAX_TIERS} labels (got ${pack.tiers.length})`)
      }
      const seen = new Set()
      pack.tiers.forEach((label, i) => {
        const err = checkString(label, { max: MAX_TIER_LABEL })
        if (err) add(`tiers[${i}]`, err)
        else if (seen.has(label.toLowerCase())) add(`tiers[${i}]`, `duplicate label "${label}"`)
        else seen.add(label.toLowerCase())
      })
    }
  }

  if (!Array.isArray(pack.items)) {
    add('items', 'is required and must be an array')
    return errors
  }
  if (pack.items.length < MIN_ITEMS || pack.items.length > MAX_ITEMS) {
    add('items', `must have ${MIN_ITEMS}–${MAX_ITEMS} items (got ${pack.items.length})`)
  }
  const seenIds = new Map()
  const seenLabels = new Set()
  pack.items.forEach((item, i) => {
    errors.push(...checkItem(item, i, seenIds, seenLabels))
  })
  return errors
}

/** The pack as served to the app: editor-only keys removed. */
export function toPublicPack(pack) {
  const { $schema: _schema, ...rest } = pack
  return rest
}

/** Catalog entry: everything but the items, so the bundle stays tiny. */
export function toSummary(pack) {
  const summary = {
    id: pack.id,
    version: pack.version,
    title: pack.title,
    description: pack.description,
    category: pack.category,
    author: pack.author,
    itemCount: pack.items.length,
    sample: pack.items.slice(0, 5).map((item) => item.label),
  }
  if (pack.accent !== undefined) summary.accent = pack.accent
  return summary
}

export function sortCatalog(summaries) {
  return [...summaries].sort(
    (a, b) => a.category.localeCompare(b.category, 'en') || a.title.localeCompare(b.title, 'en'),
  )
}
