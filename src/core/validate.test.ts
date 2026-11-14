import { describe, expect, it } from 'vitest'
import { createBoard, opAddItems } from './board'
import { COOP } from './types'
import { parseBoard, safeHttpUrl } from './validate'

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
