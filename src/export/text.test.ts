import { describe, expect, it } from 'vitest'
import { fakeMeasure as measure } from '@/test/exportFixtures'
import { ellipsize, fitText, wrapText } from './text'

const F = '600 10px sans' // 5.5px per glyph under the fake metric

describe('ellipsize', () => {
  it('leaves fitting text alone', () => {
    expect(ellipsize('hello', 100, F, measure)).toBe('hello')
  })

  it('cuts to the longest prefix that fits with an ellipsis', () => {
    const out = ellipsize('strawberries', 40, F, measure)
    expect(out).toBe('strawb…')
    expect(measure(out, F)).toBeLessThanOrEqual(40)
  })
})

describe('wrapText', () => {
  it('wraps greedily at word boundaries', () => {
    expect(wrapText('one two three four', 50, F, measure, 5).lines).toEqual([
      'one two',
      'three',
      'four',
    ])
  })

  it('splits words wider than a line when allowed', () => {
    const { lines, clipped } = wrapText('abcdefghijkl', 30, F, measure, 5)
    expect(lines).toEqual(['abcde', 'fghij', 'kl'])
    expect(clipped).toBe(true)
  })

  it('reports oversize words instead of splitting when breakWords is off', () => {
    expect(wrapText('abcdefghijkl', 30, F, measure, 5, false).clipped).toBe(true)
  })

  it('ellipsizes the last allowed line', () => {
    const { lines, clipped } = wrapText('a b c d e f g h', 20, F, measure, 2)
    expect(lines).toHaveLength(2)
    expect(lines[1]!.endsWith('…')).toBe(true)
    expect(clipped).toBe(true)
  })
})

describe('fitText', () => {
  const base = {
    maxHeight: 100,
    maxLines: 3,
    maxSize: 20,
    minSize: 10,
    font: (s: number) => `600 ${s}px sans`,
    leading: 1.2,
    measure,
  }

  it('uses the largest size that fits', () => {
    const fit = fitText({ ...base, text: 'Hi', maxWidth: 200 })
    expect(fit.size).toBe(20)
    expect(fit.clipped).toBe(false)
  })

  it('shrinks until words fit on their lines', () => {
    const fit = fitText({ ...base, text: 'Wonderful', maxWidth: 60 })
    expect(fit.size).toBeLessThan(20)
    expect(measure(fit.lines[0]!, fit.font)).toBeLessThanOrEqual(60)
    expect(fit.clipped).toBe(false)
  })

  it('falls back to the minimum size with clipping when nothing fits', () => {
    const fit = fitText({ ...base, text: 'Supercalifragilistic expialidocious', maxWidth: 30 })
    expect(fit.size).toBe(10)
    expect(fit.clipped).toBe(true)
    expect(fit.lines.length).toBeLessThanOrEqual(3)
  })
})
