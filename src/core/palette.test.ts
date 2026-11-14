import { describe, expect, it } from 'vitest'
import { contrastRatio, parseHex, readableTextOn, SWATCHES, TIER_INK } from './palette'

describe('palette', () => {
  it('every swatch meets WCAG AA with ink text', () => {
    for (const s of SWATCHES)
      expect(contrastRatio(s.hex, TIER_INK), s.name).toBeGreaterThanOrEqual(4.5)
  })
  it('parses hex', () => {
    expect(parseHex('#fff')).toEqual([255, 255, 255])
    expect(parseHex('nope')).toBeNull()
  })
  it('picks readable text on dark custom colours', () => {
    expect(readableTextOn('#101010')).not.toBe(TIER_INK)
    expect(readableTextOn('#ffffff')).toBe(TIER_INK)
  })
})
