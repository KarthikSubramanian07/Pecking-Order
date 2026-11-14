import { describe, expect, it } from 'vitest'
import { fakeMeasure, makeBoard, options } from '@/test/exportFixtures'
import {
  computeLayout,
  effectiveScale,
  type Layout,
  MAX_PIXELS,
  TILE_FLEX,
  TILE_MAX,
  TILE_MIN,
} from './layout'

const layout = (board = makeBoard({ tiers: [3, 2, 1] }), over = {}) =>
  computeLayout(board, options(over), fakeMeasure)

function allTiles(l: Layout) {
  return l.rows.flatMap((r) => r.tiles)
}

function expectInside(l: Layout) {
  for (const row of l.rows) {
    expect(row.x).toBeGreaterThanOrEqual(0)
    expect(row.x + row.w).toBeLessThanOrEqual(l.width)
    expect(row.y + row.h).toBeLessThanOrEqual(l.footer.hen.y)
    for (const t of row.tiles) {
      expect(t.x).toBeGreaterThanOrEqual(row.labelBox.x + row.labelBox.w)
      expect(t.x + t.w).toBeLessThanOrEqual(row.x + row.w)
      expect(t.y).toBeGreaterThanOrEqual(row.y)
      expect(t.y + t.h).toBeLessThanOrEqual(row.y + row.h)
    }
  }
}

describe('formats', () => {
  it('wide is 1200 wide, 16:9 minimum and uses the flexible tile size', () => {
    const l = layout(makeBoard({ tiers: [3, 1] }), { format: 'wide' })
    expect(l.format).toBe('wide')
    expect(l.width).toBe(1200)
    expect(l.height).toBe(675)
    expect(l.tile).toBe(TILE_FLEX)
    expectInside(l)
  })

  it('wide grows taller with content instead of shrinking tiles', () => {
    const l = layout(makeBoard({ tiers: [40, 40, 40, 40, 40] }), { format: 'wide' })
    expect(l.tile).toBe(TILE_FLEX)
    expect(l.height).toBeGreaterThan(675)
    expect(Number.isInteger(l.height)).toBe(true)
    expectInside(l)
  })

  it('portrait is fixed 4:5 and uses the largest tile for small boards', () => {
    const l = layout(undefined, { format: 'portrait' })
    expect([l.width, l.height]).toEqual([1080, 1350])
    expect(l.tile).toBe(TILE_MAX)
    expectInside(l)
  })

  it('portrait shrinks tiles to fit busy boards', () => {
    const l = layout(makeBoard({ tiers: [20, 20, 20, 20, 20, 20] }), { format: 'portrait' })
    expect(l.height).toBe(1350)
    expect(l.tile).toBeLessThan(TILE_MAX)
    expect(l.tile).toBeGreaterThanOrEqual(TILE_MIN)
    expectInside(l)
  })

  it('story is fixed 9:16', () => {
    const l = layout(makeBoard({ tiers: [12, 12, 12, 12] }), { format: 'story' })
    expect([l.width, l.height]).toEqual([1080, 1920])
    expectInside(l)
  })

  it('never crops: an overfull fixed format grows instead of dropping items', () => {
    const board = makeBoard({ tiers: [150, 150, 150, 150] })
    const l = layout(board, { format: 'portrait' })
    expect(l.tile).toBe(TILE_MIN)
    expect(l.height).toBeGreaterThan(1350)
    expect(allTiles(l)).toHaveLength(600)
    expectInside(l)
  })

  it('auto stays wide for short boards', () => {
    expect(layout(undefined, { format: 'auto' }).format).toBe('wide')
  })

  it('auto switches to 4:5 for tall boards that still fit legibly', () => {
    const l = layout(makeBoard({ tiers: [4, 4, 4, 4, 4, 4, 0] }), { format: 'auto' })
    expect(l.format).toBe('portrait')
    expect(l.tile).toBeGreaterThanOrEqual(80)
  })

  it('auto falls back to a tall canvas sized to content when 4:5 would be cramped', () => {
    const l = layout(makeBoard({ tiers: [60, 60, 60, 60, 60, 60] }), { format: 'auto' })
    expect(l.format).toBe('wide')
    expect(l.height).toBeGreaterThan(l.width * 0.75)
    expect(allTiles(l)).toHaveLength(360)
    expectInside(l)
  })
})

describe('rows', () => {
  it('wraps a crowded tier onto several lines without overlap', () => {
    const l = layout(makeBoard({ tiers: [30] }), { format: 'wide' })
    const tiles = allTiles(l)
    const lines = new Set(tiles.map((t) => t.y))
    expect(lines.size).toBeGreaterThan(1)
    for (let i = 1; i < tiles.length; i++) {
      const [a, b] = [tiles[i - 1]!, tiles[i]!]
      if (a.y === b.y) expect(b.x).toBeGreaterThanOrEqual(a.x + a.w)
      else expect(b.y).toBeGreaterThanOrEqual(a.y + a.h)
    }
    // The label block spans every line of its row.
    const row = l.rows[0]!
    expect(row.labelBox.h).toBeGreaterThan(l.tile * lines.size)
  })

  it('keeps empty tiers, with an egg hint slot', () => {
    const l = layout(makeBoard({ tiers: [2, 0, 1] }))
    expect(l.rows).toHaveLength(3)
    expect(l.rows[1]!.tiles).toHaveLength(0)
    expect(l.rows[1]!.emptySlot).not.toBeNull()
    expect(l.rows[0]!.emptySlot).toBeNull()
  })

  it('adds an UNRANKED row only when includeCoop is on and the coop has items', () => {
    const board = makeBoard({ tiers: [2, 2], coop: 3 })
    expect(layout(board, { includeCoop: false }).rows.map((r) => r.kind)).toEqual(['tier', 'tier'])
    const on = layout(board, { includeCoop: true })
    expect(on.rows.map((r) => r.kind)).toEqual(['tier', 'tier', 'coop'])
    expect(on.rows[2]!.label.lines).toEqual(['UNRANKED'])
    expect(on.rows[2]!.tiles).toHaveLength(3)
    const empty = makeBoard({ tiers: [2, 2] })
    expect(layout(empty, { includeCoop: true }).rows).toHaveLength(2)
  })

  it('uses square mono labels for short tier names and wider wrapped ones otherwise', () => {
    const short = layout(makeBoard({ tiers: [1, 1] }))
    expect(short.rows[0]!.labelBox.w).toBe(short.tile)
    expect(short.rows[0]!.label.font).toContain('JetBrains Mono')

    const long = layout(
      makeBoard({ tiers: [1, 1], tierLabels: ['Absolutely top chicken material', 'Nope'] }),
    )
    const row = long.rows[0]!
    expect(row.labelBox.w).toBeGreaterThan(long.tile)
    expect(row.label.font).toContain('Instrument Sans')
    expect(row.label.lines.length).toBeGreaterThan(1)
    expect(row.label.lines.length).toBeLessThanOrEqual(3)
    for (const line of row.label.lines) {
      expect(fakeMeasure(line, row.label.font)).toBeLessThanOrEqual(row.labelBox.w)
    }
  })

  it('captions image tiles only when showLabels is on; text tiles always get centred text', () => {
    const board = makeBoard({ tiers: [4], textEvery: 2 })
    const on = allTiles(layout(board, { showLabels: true }))
    expect(on.filter((t) => t.image).every((t) => t.caption)).toBe(true)
    expect(on.filter((t) => !t.image).every((t) => !t.caption && t.text.lines.length > 0)).toBe(
      true,
    )
    expect(allTiles(layout(board, { showLabels: false })).some((t) => t.caption)).toBe(false)
  })

  it('skips placement ids whose item is missing', () => {
    const board = makeBoard({ tiers: [2] })
    board.placement.t0!.push('ghost')
    expect(allTiles(layout(board))).toHaveLength(2)
  })
})

describe('header', () => {
  const contentWidth = (l: Layout) => l.width - l.title.x * 2

  it('sets a short title on one line at the largest size', () => {
    const l = layout(makeBoard({ title: 'Snacks', tiers: [1] }), { format: 'wide' })
    expect(l.title.lines).toEqual(['Snacks'])
    expect(l.title.size).toBe(80)
  })

  it('wraps a long title onto two lines that fit the width', () => {
    const title = 'Every single breakfast cereal I have eaten, ranked'
    const l = layout(makeBoard({ title, tiers: [1] }), { format: 'wide' })
    expect(l.title.lines).toHaveLength(2)
    expect(l.title.size).toBeLessThanOrEqual(72)
    expect(l.title.size).toBeGreaterThanOrEqual(56)
    for (const line of l.title.lines) {
      expect(fakeMeasure(line, l.title.font)).toBeLessThanOrEqual(contentWidth(l))
    }
  })

  it('ellipsizes a title that cannot fit in two lines', () => {
    const title = 'word '.repeat(60).trim()
    const l = layout(makeBoard({ title, tiers: [1] }), { format: 'wide' })
    expect(l.title.lines).toHaveLength(2)
    expect(l.title.size).toBe(56)
    expect(l.title.lines[1]!.endsWith('…')).toBe(true)
    expect(fakeMeasure(l.title.lines[1]!, l.title.font)).toBeLessThanOrEqual(contentWidth(l))
  })

  it('underlines roughly the first 40% of the title, below the last line', () => {
    const l = layout(makeBoard({ title: 'Snacks ranked forever', tiers: [1] }), { format: 'wide' })
    const width = fakeMeasure(l.title.lines[0]!, l.title.font)
    expect(l.underline.w).toBeCloseTo(width * 0.4, 0)
    expect(l.underline.y).toBeGreaterThan(l.title.baselines.at(-1)!)
    expect(l.meta.baselines[0]).toBeGreaterThan(l.underline.y)
  })

  it('writes an uppercase meta line with byline, ranked count and month', () => {
    const board = makeBoard({ tiers: [2, 3], coop: 4 })
    expect(layout(board, { byline: 'ranked by @hen' }).meta.lines[0]).toBe(
      'RANKED BY @HEN · 5 RANKED · NOV 2026',
    )
    expect(layout(board).meta.lines[0]).toBe('5 RANKED · NOV 2026')
  })
})

describe('scale', () => {
  it('passes through a sane scale', () => {
    expect(layout(undefined, { scale: 2 }).scale).toBe(2)
  })

  it('clamps the requested scale to 1–3', () => {
    expect(effectiveScale(0.2, 1200, 675)).toBe(1)
    expect(effectiveScale(9, 1200, 675)).toBe(3)
    expect(effectiveScale(Number.NaN, 1200, 675)).toBe(1)
  })

  it('lowers the scale to stay under the iOS canvas pixel cap', () => {
    const s = effectiveScale(3, 1080, 1920)
    expect(s).toBeLessThan(3)
    expect(Math.floor(1080 * s) * Math.floor(1920 * s)).toBeLessThanOrEqual(MAX_PIXELS)
  })

  it('caps very tall canvases by area and by side length', () => {
    const l = layout(makeBoard({ tiers: [400, 400, 400, 400, 400] }), { format: 'wide', scale: 3 })
    expect(l.scale).toBeLessThan(1)
    expect(l.width * l.scale * l.height * l.scale).toBeLessThanOrEqual(MAX_PIXELS)
    expect(l.height * l.scale).toBeLessThanOrEqual(16_384)
  })
})

it('is deterministic', () => {
  const board = makeBoard({ tiers: [5, 3, 0, 2], coop: 2, textEvery: 3 })
  const opts = { includeCoop: true, byline: 'me' }
  expect(layout(board, opts)).toEqual(layout(board, opts))
})
