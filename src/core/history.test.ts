import { describe, expect, it } from 'vitest'
import { emptyHistory, record, redo, undo } from './history'

describe('history', () => {
  it('undoes and redoes', () => {
    let h = emptyHistory<number>()
    h = record(h, 1)
    h = record(h, 2)
    const u = undo(h, 3)
    expect(u?.state).toBe(2)
    const r = redo(u!.history, 2)
    expect(r?.state).toBe(3)
    expect(undo(emptyHistory<number>(), 0)).toBeNull()
    expect(redo(emptyHistory<number>(), 0)).toBeNull()
  })

  it('drops the redo branch on new records and caps length', () => {
    let h = emptyHistory<number>()
    for (let i = 0; i < 10; i++) h = record(h, i, 5)
    expect(h.past).toEqual([5, 6, 7, 8, 9])
    const u = undo(h, 10)!
    expect(record(u.history, 9).future).toEqual([])
  })
})
