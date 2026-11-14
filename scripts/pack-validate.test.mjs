import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SWATCHES } from '../src/core/palette.ts'
import { ALLOWED_IMAGE_HOSTS as APP_HOSTS } from '../src/packs/spec.ts'
import {
  ALLOWED_IMAGE_HOSTS,
  CATEGORIES,
  isPackFolder,
  MAX_ITEMS,
  parseSwatchNames,
  sortCatalog,
  toPublicPack,
  toSummary,
  validatePack,
} from './pack-validate.mjs'

const root = join(import.meta.dirname, '..')
const swatchNames = SWATCHES.map((s) => s.name)
const opts = { folder: 'fruits', swatchNames }

function makePack(overrides = {}) {
  return {
    $schema: '../pack.schema.json',
    id: 'fruits',
    version: '1.0.0',
    title: 'Fruits',
    description: 'Nature’s candy.',
    category: 'Food & Drink',
    author: 'Pecking Order',
    accent: 'Yolk',
    items: [
      { id: 'apple', label: 'Apple', wikipedia: 'Apple' },
      { id: 'pizza', label: 'Pizza', commons: 'File:Pizza.jpg' },
      {
        id: 'pear',
        label: 'Pear',
        image: 'https://upload.wikimedia.org/wikipedia/commons/a/b/Pear.jpg',
      },
      { id: 'quince', label: 'Quince' },
    ],
    ...overrides,
  }
}

function withItem(patch) {
  const pack = makePack()
  pack.items[0] = { ...pack.items[0], ...patch }
  return pack
}

describe('validatePack', () => {
  it('accepts a well-formed pack', () => {
    expect(validatePack(makePack(), opts)).toEqual([])
  })

  it('accepts custom tiers', () => {
    expect(validatePack(makePack({ tiers: ['Yum', 'Fine', 'Why'] }), opts)).toEqual([])
  })

  it('rejects non-objects', () => {
    expect(validatePack([], opts)).toEqual(['pack.json must contain a JSON object'])
  })

  it('requires the core fields', () => {
    const errors = validatePack({ items: makePack().items }, opts)
    for (const field of ['id', 'version', 'title', 'description', 'author', 'category']) {
      expect(errors.some((e) => e.startsWith(`${field}:`))).toBe(true)
    }
  })

  it('rejects unknown keys at both levels', () => {
    expect(validatePack(makePack({ colour: 'red' }), opts)).toEqual([
      expect.stringMatching(/^colour: unknown key/),
    ])
    expect(validatePack(withItem({ emoji: '🍎' }), opts)).toEqual([
      expect.stringMatching(/^item "apple" › emoji: unknown key/),
    ])
  })

  it('requires the id to be kebab-case and match the folder', () => {
    expect(validatePack(makePack({ id: 'Fruits' }), opts)[0]).toMatch(/^id: must be kebab-case/)
    expect(validatePack(makePack({ id: 'fruit' }), opts)).toEqual([
      'id: must match its folder name "fruits" (got "fruit")',
    ])
  })

  it('requires a semantic version', () => {
    for (const version of ['1.0', 'v1.0.0', '01.0.0', 1]) {
      expect(validatePack(makePack({ version }), opts)[0]).toMatch(/^version: must be a semantic/)
    }
  })

  it('checks text fields for whitespace and length', () => {
    expect(validatePack(makePack({ title: ' Fruits' }), opts)).toEqual([
      'title: must not start or end with whitespace',
    ])
    expect(validatePack(makePack({ description: 'x'.repeat(141) }), opts)).toEqual([
      'description: must be at most 140 characters (got 141)',
    ])
  })

  it('only allows known categories and palette accents', () => {
    expect(validatePack(makePack({ category: 'Fruit' }), opts)[0]).toMatch(
      /^category: must be one of/,
    )
    expect(validatePack(makePack({ accent: 'Teal' }), opts)[0]).toMatch(
      /^accent: must be a palette swatch name: Comb, Yolk/,
    )
  })

  it('validates tier labels', () => {
    expect(validatePack(makePack({ tiers: ['Only'] }), opts)).toEqual([
      'tiers: must have 2–20 labels (got 1)',
    ])
    expect(validatePack(makePack({ tiers: ['Good', 'good'] }), opts)).toEqual([
      'tiers[1]: duplicate label "good"',
    ])
    expect(validatePack(makePack({ tiers: ['A', 'x'.repeat(33)] }), opts)[0]).toMatch(/^tiers\[1\]/)
  })

  it('enforces the item count range', () => {
    const items = (n) => Array.from({ length: n }, (_, i) => ({ id: `i${i}`, label: `Item ${i}` }))
    expect(validatePack(makePack({ items: items(2) }), opts)).toEqual([
      'items: must have 3–150 items (got 2)',
    ])
    expect(validatePack(makePack({ items: items(MAX_ITEMS + 1) }), opts)).toEqual([
      'items: must have 3–150 items (got 151)',
    ])
    expect(validatePack(makePack({ items: 'apple' }), opts)).toEqual([
      'items: is required and must be an array',
    ])
  })

  it('names the offending item in errors', () => {
    expect(validatePack(withItem({ label: 'x'.repeat(81) }), opts)).toEqual([
      'item "apple" › label: must be at most 80 characters (got 81)',
    ])
    const pack = makePack()
    pack.items[1] = 'pizza'
    expect(validatePack(pack, opts)).toEqual(['items[1]: must be an object'])
  })

  it('rejects duplicate item ids and labels', () => {
    const pack = makePack()
    pack.items.push({ id: 'apple', label: 'Green apple' }, { id: 'apple-2', label: 'APPLE' })
    expect(validatePack(pack, opts)).toEqual([
      'item "apple" › id: duplicate id (also used by items[0])',
      'item "apple-2" › label: duplicate label "APPLE"',
    ])
  })

  it('allows at most one image source', () => {
    expect(validatePack(withItem({ commons: 'File:Apple.jpg' }), opts)).toEqual([
      'item "apple" › wikipedia+commons: use at most one of "wikipedia", "commons" or "image"',
    ])
  })

  it('wants Wikipedia titles, not URLs', () => {
    expect(
      validatePack(withItem({ wikipedia: 'https://en.wikipedia.org/wiki/Apple' }), opts)[0],
    ).toMatch(/use the article title/)
    expect(validatePack(withItem({ wikipedia: 'Apple#History' }), opts)[0]).toMatch(/#sections/)
  })

  it('checks Commons file names', () => {
    expect(validatePack(withItem({ wikipedia: undefined, commons: 'Pizza.jpg' }), opts)[0]).toMatch(
      /must look like "File:Name.jpg"/,
    )
    expect(
      validatePack(withItem({ wikipedia: undefined, commons: 'File:Doc.pdf' }), opts),
    ).toHaveLength(1)
  })

  it('only allows https images on allow-listed hosts', () => {
    const image = (url) => withItem({ wikipedia: undefined, image: url })
    expect(validatePack(image('https://example.com/a.jpg'), opts)[0]).toMatch(
      /host "example.com" is not allowed/,
    )
    expect(validatePack(image('http://upload.wikimedia.org/a.jpg'), opts)[0]).toMatch(/https/)
    expect(validatePack(image('not a url'), opts)[0]).toMatch(/absolute URL/)
    expect(validatePack(image('https://static.tvmaze.com/a.jpg'), opts)).toEqual([])
  })

  it('validates tags', () => {
    expect(validatePack(withItem({ tags: ['red', 'sweet'] }), opts)).toEqual([])
    expect(validatePack(withItem({ tags: 'red' }), opts)[0]).toMatch(/must be an array/)
    expect(validatePack(withItem({ tags: ['Red'] }), opts)[0]).toMatch(/kebab-case/)
    expect(validatePack(withItem({ tags: ['red', 'red'] }), opts)[0]).toMatch(/duplicate tag/)
  })
})

describe('catalog helpers', () => {
  it('summarises without items and keeps optional accent', () => {
    const summary = toSummary(makePack())
    expect(summary).toEqual({
      id: 'fruits',
      version: '1.0.0',
      title: 'Fruits',
      description: 'Nature’s candy.',
      category: 'Food & Drink',
      author: 'Pecking Order',
      accent: 'Yolk',
      itemCount: 4,
      sample: ['Apple', 'Pizza', 'Pear', 'Quince'],
    })
    expect('accent' in toSummary(makePack({ accent: undefined }))).toBe(false)
  })

  it('sorts by category, then title', () => {
    const s = (category, title) => ({ category, title })
    expect(sortCatalog([s('Tech', 'B'), s('Animals', 'Z'), s('Tech', 'A')])).toEqual([
      s('Animals', 'Z'),
      s('Tech', 'A'),
      s('Tech', 'B'),
    ])
  })

  it('drops editor-only keys from the public pack', () => {
    expect('$schema' in toPublicPack(makePack())).toBe(false)
  })

  it('skips folders starting with _ or .', () => {
    expect(['fruits', '_template', '.cache'].filter(isPackFolder)).toEqual(['fruits'])
  })
})

describe('single sources of truth', () => {
  const schema = JSON.parse(readFileSync(join(root, 'packs/pack.schema.json'), 'utf8'))

  it('reads swatch names straight from palette.ts', () => {
    const source = readFileSync(join(root, 'src/core/palette.ts'), 'utf8')
    expect(parseSwatchNames(source)).toEqual(swatchNames)
  })

  it('keeps the image allow-list in sync with the app', () => {
    expect(ALLOWED_IMAGE_HOSTS).toEqual([...APP_HOSTS])
  })

  it('keeps the JSON Schema in sync with the validator', () => {
    expect(schema.properties.category.enum).toEqual(CATEGORIES)
    expect(schema.properties.accent.enum).toEqual(swatchNames)
    const hostPattern = schema.$defs.item.properties.image.pattern
    for (const host of ALLOWED_IMAGE_HOSTS) {
      expect(new RegExp(hostPattern).test(`https://${host}/x.jpg`)).toBe(true)
    }
    expect(new RegExp(hostPattern).test('https://example.com/x.jpg')).toBe(false)
  })
})

describe('shipped packs', () => {
  const folders = readdirSync(join(root, 'packs'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && isPackFolder(e.name))
    .map((e) => e.name)

  it.each(folders)('%s is valid', (folder) => {
    const pack = JSON.parse(readFileSync(join(root, 'packs', folder, 'pack.json'), 'utf8'))
    expect(validatePack(pack, { folder, swatchNames })).toEqual([])
  })

  it('the template is valid apart from its placeholder id', () => {
    const pack = JSON.parse(readFileSync(join(root, 'packs/_template/pack.json'), 'utf8'))
    expect(validatePack(pack, { folder: 'my-pack', swatchNames })).toEqual([])
  })
})
