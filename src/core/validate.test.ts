import { describe, expect, it } from 'vitest'
import { assertValidBoard, createBoard, opAddItems } from './board'
import { COOP } from './types'
import { MAX_ITEMS, parseBoard, parseCredit, safeHttpUrl } from './validate'

describe('parseBoard', () => {
  it('round-trips a valid board', () => {
    const b = createBoard({ title: 'Snacks' })
    opAddItems(b, [{ label: 'Chips', image: 'a'.repeat(64) }])
    const parsed = parseBoard(JSON.parse(JSON.stringify(b)))
    expect(parsed).toEqual(b)
  })

  it('rejects non-boards', () => {
    expect(() => parseBoard(null)).toThrow()
    expect(() => parseBoard({ v: 2 })).toThrow(/version/)
  })

  it('repairs hostile or broken input', () => {
    const parsed = parseBoard({
      v: 1,
      title: 'x'.repeat(500),
      tiers: [
        { id: 'coop', label: 'Sneaky', color: 'javascript:alert(1)' },
        { id: 't_aaaaaaaa', label: 'A', color: '#fff' },
        { id: 't_aaaaaaaa', label: 'Dup', color: '#000' },
      ],
      items: {
        i_one111111: {
          id: 'i_one111111',
          label: '<img src=x onerror=alert(1)>',
          image: 'not-a-hash',
        },
        i_two222222: {
          id: 'i_two222222',
          label: 'Two',
          credit: { provider: 'openverse', sourceUrl: 'javascript:alert(1)' },
        },
        junk: 42,
      },
      placement: { t_aaaaaaaa: ['i_one111111', 'i_one111111', 'ghost'], coop: [] },
    })
    expect(parsed.title.length).toBe(120)
    expect(parsed.tiers).toHaveLength(3)
    expect(new Set(parsed.tiers.map((t) => t.id)).size).toBe(3)
    expect(parsed.tiers.some((t) => t.id === COOP)).toBe(false)
    expect(parsed.tiers[0]?.color).toMatch(/^#/)
    const one = Object.values(parsed.items).find((i) => i.label.startsWith('<img'))
    expect(one?.image).toBeUndefined()
    const two = Object.values(parsed.items).find((i) => i.label === 'Two')
    expect(two?.credit?.sourceUrl).toBeUndefined()
    // ghost/duplicate dropped, unplaced "Two" rescued into the coop
    expect(parsed.placement.t_aaaaaaaa).toHaveLength(1)
    expect(parsed.placement[COOP]).toHaveLength(1)
  })
})

describe('safeHttpUrl', () => {
  it('allows only http(s)', () => {
    expect(safeHttpUrl('https://example.com/a')).toBe('https://example.com/a')
    expect(safeHttpUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeHttpUrl('data:text/html,hi')).toBeUndefined()
    expect(safeHttpUrl(42)).toBeUndefined()
  })
})

describe('parseBoard against prototype pollution', () => {
  const RESERVED = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']

  it('never uses a reserved key as a tier or item id', () => {
    // JSON.parse keeps "__proto__" as an own key, exactly like a hostile file would.
    const raw = JSON.parse(
      JSON.stringify({
        v: 1,
        id: '__proto__',
        title: 'Hostile',
        tiers: RESERVED.map((id) => ({ id, label: id, color: '#fff' })),
        items: Object.fromEntries(RESERVED.map((id) => [id, { id, label: `item ${id}` }])),
        placement: Object.fromEntries(RESERVED.map((id) => [id, [id]])),
      }).replace('"items":{', '"items":{"__proto__":{"id":"__proto__","label":"proto"},'),
    )
    const board = parseBoard(raw)
    expect(board.id).not.toBe('__proto__')
    for (const id of [...board.tiers.map((t) => t.id), ...Object.keys(board.items)]) {
      expect(RESERVED).not.toContain(id)
    }
    expect(Object.getPrototypeOf(board.items)).toBe(Object.prototype)
    expect(Object.getPrototypeOf(board.placement)).toBe(Object.prototype)
    for (const t of board.tiers) expect(Object.hasOwn(board.placement, t.id)).toBe(true)
    expect(Object.keys(board.items)).toHaveLength(RESERVED.length)
    assertValidBoard(board)
  })

  it('ignores inherited placement keys', () => {
    const board = parseBoard({
      v: 1,
      tiers: [{ id: 't_aaaaaaaa', label: 'A', color: '#fff' }],
      items: { i_one111111: { id: 'i_one111111', label: 'One' } },
      placement: Object.create({ t_aaaaaaaa: ['i_one111111'] }),
    })
    expect(board.placement.t_aaaaaaaa).toEqual([])
    expect(board.placement[COOP]).toEqual(['i_one111111'])
  })
})

describe('parseBoard against oversized or malformed values', () => {
  it('keeps only exact #rgb / #rrggbb tier colours', () => {
    const colors = ['#ABC', '#a1b2c3', 'fff', ' #fff', '#fff;background:url(x)', 'red', 42]
    const board = parseBoard({
      v: 1,
      tiers: colors.map((color, i) => ({ id: `t_tier${i}aaaa`, label: 'X', color })),
    })
    expect(board.tiers.map((t) => t.color).slice(0, 2)).toEqual(['#ABC', '#a1b2c3'])
    for (const t of board.tiers.slice(2)) expect(t.color).toMatch(/^#[0-9A-F]{6}$/i)
  })

  it('caps items and clamps huge strings', () => {
    const items = Object.fromEntries(
      Array.from({ length: MAX_ITEMS + 50 }, (_, i) => [`i_${i}`, { id: `i_${i}`, label: 'x' }]),
    )
    const board = parseBoard({
      v: 1,
      title: 'y'.repeat(5_000_000),
      tiers: [],
      items: { ...items, big: { id: 'big', label: 'z'.repeat(5_000_000) } },
    })
    expect(Object.keys(board.items)).toHaveLength(MAX_ITEMS)
    expect(board.title.length).toBeLessThanOrEqual(120)
  })

  it('bounds credit strings and drops non-http links', () => {
    const credit = parseCredit({
      provider: 'openverse',
      sourceUrl: 'data:text/html,<script>alert(1)</script>',
      author: 'a'.repeat(10_000),
      license: 'l'.repeat(10_000),
    })
    expect(credit?.sourceUrl).toBeUndefined()
    expect(credit?.author?.length).toBeLessThanOrEqual(200)
    expect(credit?.license?.length).toBeLessThanOrEqual(80)
    expect(parseCredit({ provider: 'evil' })).toBeUndefined()
  })
})
