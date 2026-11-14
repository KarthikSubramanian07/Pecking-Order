import { beforeEach, describe, expect, it } from 'vitest'
import { opAddItems, opMoveItem } from '@/core/board'
import { COOP } from '@/core/types'
import { resetDbForTests } from '@/storage/db'
import { useBoardStore } from './boardStore'

const s = () => useBoardStore.getState()

beforeEach(async () => {
  // Settle any debounced save from the previous test before wiping the DB.
  await s().flush()
  await resetDbForTests()
  await new Promise((r) => {
    const req = indexedDB.deleteDatabase('pecking-order')
    req.onsuccess = req.onerror = r
  })
  useBoardStore.setState({ ready: false, board: null, boards: [] })
  await s().init()
  await s().newBoard()
})

describe('boardStore', () => {
  it('starts on no board, then opens new ones', async () => {
    useBoardStore.setState({ ready: false, board: null })
    await s().init()
    expect(s().ready).toBe(true)
    expect(s().boards).toHaveLength(1)
    const id = await s().newBoard({ title: 'Snacks' })
    expect(s().board?.id).toBe(id)
    expect(s().boards).toHaveLength(2)
  })

  it('applies ops with undo/redo', () => {
    s().apply((b) => void opAddItems(b, [{ label: 'Egg' }]))
    expect(s().board?.placement[COOP]).toHaveLength(1)
    s().undo()
    expect(s().board?.placement[COOP]).toHaveLength(0)
    s().redo()
    expect(s().board?.placement[COOP]).toHaveLength(1)
  })

  it('collapses a gesture into one undo step and supports cancel', () => {
    s().apply((b) => void opAddItems(b, [{ label: 'Egg' }]))
    const id = s().board?.placement[COOP]?.[0] as string
    const [t1, t2] = (s().board?.tiers ?? []).map((t) => t.id) as [string, string]
    const before = s().history.past.length
    s().beginGesture()
    s().applyLive((b) => opMoveItem(b, id, t1))
    s().applyLive((b) => opMoveItem(b, id, t2))
    s().endGesture()
    expect(s().history.past.length).toBe(before + 1)
    expect(s().board?.placement[t2]).toEqual([id])

    s().beginGesture()
    s().applyLive((b) => opMoveItem(b, id, COOP))
    s().endGesture(false)
    expect(s().board?.placement[t2]).toEqual([id])
  })

  it('persists, creates, switches and deletes boards', async () => {
    s().apply((b) => void opAddItems(b, [{ label: 'Saved' }]))
    await s().flush()
    const firstId = s().board?.id as string
    await s().newBoard({ title: 'Second' })
    expect(s().boards).toHaveLength(2)
    expect(await s().loadBoard(firstId)).toBe(true)
    expect(Object.values(s().board?.items ?? {})[0]?.label).toBe('Saved')
    await s().deleteBoard(firstId)
    expect(s().board).toBeNull()
    expect(s().boards.map((b) => b.title)).toEqual(['Second'])
    expect(await s().loadBoard('b_missing')).toBe(false)
  })
})
