import { describe, expect, it } from 'vitest'
import { mapWithConcurrency } from './pool'

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('mapWithConcurrency', () => {
  it('keeps input order even when calls finish out of order', async () => {
    const result = await mapWithConcurrency([30, 10, 20], 3, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms))
      return `${i}:${ms}`
    })
    expect(result).toEqual(['0:30', '1:10', '2:20'])
  })

  it('never runs more than `limit` calls at once', async () => {
    let active = 0
    let peak = 0
    await mapWithConcurrency(
      Array.from({ length: 20 }, (_, i) => i),
      6,
      async () => {
        active++
        peak = Math.max(peak, active)
        await tick()
        active--
      },
    )
    expect(peak).toBe(6)
  })

  it('handles empty input', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([])
  })
})
