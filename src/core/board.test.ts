import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import {
  assertValidBoard,
  cloneBoard,
  createBoard,
  findContainer,
  MAX_TIERS,
  opAddItems,
  opAddTier,
  opClearTier,
  opMoveItem,
  opMoveTier,
  opRemoveItems,
  opRemoveTier,
  opResetPlacement,
  opShuffleCoop,
  opSortContainer,
  opUpdateTier,
  summarize,
} from './board'
import { COOP } from './types'

const seeded = () => {
  const b = createBoard()
  opAddItems(
    b,
    ['Alpha', 'Bravo', 'Charlie', 'Delta'].map((label) => ({ label })),
  )
  return b
}

describe('createBoard', () => {
  it('starts with classic tiers and an empty coop', () => {
    const b = createBoard()
    expect(b.tiers.map((t) => t.label)).toEqual(['S', 'A', 'B', 'C', 'D', 'F'])
    expect(b.placement[COOP]).toEqual([])
    assertValidBoard(b)
  })
})

describe('items', () => {
  it('adds items to the coop by default and clamps labels', () => {
    const b = createBoard()
    const [id] = opAddItems(b, [{ label: `  ${'x'.repeat(200)}  ` }])
    expect(b.placement[COOP]).toEqual([id])
    expect(b.items[id as string]?.label.length).toBe(80)
  })

  it('moves between containers and reorders within one', () => {
    const b = seeded()
    const [a, , c] = b.placement[COOP] as string[]
    const s = b.tiers[0]?.id as string
    opMoveItem(b, a as string, s)
    opMoveItem(b, c as string, s, 0)
    expect(b.placement[s]).toEqual([c, a])
    opMoveItem(b, a as string, s, 0)
    expect(b.placement[s]).toEqual([a, c])
    expect(findContainer(b, a as string)).toBe(s)
    assertValidBoard(b)
  })

  it('clamps out-of-range indexes', () => {
    const b = seeded()
    const id = b.placement[COOP]?.[0] as string
    opMoveItem(b, id, COOP, 999)
    expect(b.placement[COOP]?.at(-1)).toBe(id)
  })

  it('removes items everywhere', () => {
    const b = seeded()
    const [a, bb] = b.placement[COOP] as string[]
    opMoveItem(b, a as string, b.tiers[1]?.id as string)
    opRemoveItems(b, [a as string, bb as string])
    expect(Object.keys(b.items)).toHaveLength(2)
    assertValidBoard(b)
  })

  it('works under immer without mutating the original', () => {
    const b = seeded()
    const next = produce(b, (d) =>
      opMoveItem(d, d.placement[COOP]?.[0] as string, d.tiers[0]?.id as string),
    )
    expect(b.placement[b.tiers[0]?.id as string]).toEqual([])
    expect(next.placement[next.tiers[0]?.id as string]).toHaveLength(1)
  })
})

describe('tiers', () => {
  it('adds, renames, moves and removes tiers, rescuing items', () => {
    const b = seeded()
    const t = opAddTier(b, 0, 'GOAT') as string
    expect(b.tiers[0]?.label).toBe('GOAT')
    opUpdateTier(b, t, { label: '   ' })
    expect(b.tiers[0]?.label).toBe('GOAT')
    const item = b.placement[COOP]?.[3] as string
    opMoveItem(b, item, t)
    opMoveTier(b, t, 3)
    expect(b.tiers[3]?.id).toBe(t)
    opRemoveTier(b, t)
    expect(b.placement[COOP]?.[0]).toBe(item)
    assertValidBoard(b)
  })

  it('caps the number of tiers', () => {
    const b = createBoard()
    while (opAddTier(b)) {}
    expect(b.tiers).toHaveLength(MAX_TIERS)
  })

  it('clears a tier into the coop', () => {
    const b = seeded()
    const s = b.tiers[0]?.id as string
    const id = b.placement[COOP]?.[2] as string
    opMoveItem(b, id, s)
    opClearTier(b, s)
    expect(b.placement[s]).toEqual([])
    expect(b.placement[COOP]?.[0]).toBe(id)
  })
})

describe('bulk', () => {
  it('resets placement preserving visual order', () => {
    const b = seeded()
    const ids = [...(b.placement[COOP] as string[])]
    opMoveItem(b, ids[3] as string, b.tiers[0]?.id as string)
    opResetPlacement(b)
    expect(b.placement[COOP]).toEqual([ids[3], ids[0], ids[1], ids[2]])
  })

  it('shuffles deterministically with an injected rng', () => {
    const b = seeded()
    opShuffleCoop(b, () => 0)
    expect(b.placement[COOP]?.map((id) => b.items[id]?.label)).toEqual([
      'Bravo',
      'Charlie',
      'Delta',
      'Alpha',
    ])
  })

  it('sorts naturally', () => {
    const b = createBoard()
    opAddItems(
      b,
      ['item 10', 'Item 2', 'item 1'].map((label) => ({ label })),
    )
    opSortContainer(b, COOP)
    expect(b.placement[COOP]?.map((id) => b.items[id]?.label)).toEqual([
      'item 1',
      'Item 2',
      'item 10',
    ])
  })
})

describe('derived', () => {
  it('summarizes and clones', () => {
    const b = seeded()
    opMoveItem(b, b.placement[COOP]?.[0] as string, b.tiers[0]?.id as string)
    expect(summarize(b)).toMatchObject({ itemCount: 4, rankedCount: 1 })
    const c = cloneBoard(b)
    expect(c.id).not.toBe(b.id)
    expect(c.title).toMatch(/\(copy\)$/)
    assertValidBoard(c)
  })
})
