import { describe, expect, it } from 'vitest'
import { answer, distribute, estimateRemaining, isDone, question, startPeckoff } from './peckoff'

/** Plays a full peck-off where lower numbers are "better". */
function play(items: string[]) {
  let s = startPeckoff(items, () => 0.37)
  let guard = 0
  while (!isDone(s) && guard++ < 1000) {
    const q = question(s)
    if (!q) break
    s = answer(s, Number(q.current) < Number(q.other) ? 'current' : 'other')
  }
  return s
}

describe('peck-off', () => {
  it('sorts correctly with ~n log n questions', () => {
    const items = Array.from({ length: 20 }, (_, i) => String(i))
    const s = play(items)
    expect(s.ranked).toEqual(items)
    expect(s.answered).toBeLessThanOrEqual(70)
  })

  it('handles trivial inputs', () => {
    expect(isDone(startPeckoff([]))).toBe(true)
    expect(startPeckoff(['a']).ranked).toEqual(['a'])
    expect(question(startPeckoff(['a']))).toBeNull()
  })

  it('places ties next to their equal', () => {
    let s = startPeckoff(['a', 'b'], () => 0.99)
    s = answer(s, 'tie')
    expect(isDone(s)).toBe(true)
    expect(s.ranked).toHaveLength(2)
  })

  it('estimates remaining work and shrinks it', () => {
    const s = startPeckoff(['1', '2', '3', '4', '5', '6'], () => 0.5)
    const before = estimateRemaining(s)
    expect(before).toBeGreaterThan(0)
    const q = question(s)!
    expect(
      estimateRemaining(answer(s, Number(q.current) < Number(q.other) ? 'current' : 'other')),
    ).toBeLessThanOrEqual(before)
  })

  it('distributes evenly with remainder in the middle', () => {
    expect(distribute([1, 2, 3, 4, 5, 6, 7], 3).map((t) => t.length)).toEqual([2, 3, 2])
    expect(distribute([1, 2], 5).flat()).toEqual([1, 2])
    expect(distribute([1, 2, 3, 4, 5, 6], 6).every((t) => t.length === 1)).toBe(true)
  })
})
