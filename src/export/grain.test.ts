import { expect, it } from 'vitest'
import { grainPixels, hashString, seededRandom } from './grain'

it('seeded random is deterministic and in [0, 1)', () => {
  const a = seededRandom(42)
  const b = seededRandom(42)
  const xs = Array.from({ length: 100 }, () => a())
  expect(xs).toEqual(Array.from({ length: 100 }, () => b()))
  expect(xs.every((x) => x >= 0 && x < 1)).toBe(true)
})

it('grain tile is stable and sparse', () => {
  const px = grainPixels(32, 7, 0.1)
  expect(px).toEqual(grainPixels(32, 7, 0.1))
  let opaque = 0
  for (let i = 3; i < px.length; i += 4) if (px[i] === 255) opaque++
  const ratio = opaque / (32 * 32)
  expect(ratio).toBeGreaterThan(0.05)
  expect(ratio).toBeLessThan(0.15)
})

it('hashString is stable and spreads nearby strings', () => {
  expect(hashString('Fruit')).toBe(hashString('Fruit'))
  expect(hashString('Fruit')).not.toBe(hashString('Fruits'))
})
