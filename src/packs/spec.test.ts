import { describe, expect, it } from 'vitest'
import { isAllowedImageUrl, parsePack } from './spec'

const base = {
  id: 'fruits',
  version: '1.2.0',
  title: 'Fruits',
  description: 'Nature’s candy.',
  category: 'Food & Drink',
  author: 'Pecking Order',
  items: [{ id: 'apple', label: 'Apple', wikipedia: 'Apple' }],
}

describe('parsePack', () => {
  it('keeps a well-formed pack', () => {
    expect(parsePack({ ...base, accent: 'Yolk', tiers: ['Yum', 'Nah'] })).toEqual({
      ...base,
      accent: 'Yolk',
      tiers: ['Yum', 'Nah'],
    })
  })

  it('rejects input that is not a usable pack', () => {
    expect(() => parsePack(null)).toThrow('not an object')
    expect(() => parsePack({ ...base, id: '../evil' })).toThrow('bad id')
    expect(() => parsePack({ ...base, title: '' })).toThrow('missing title')
    expect(() => parsePack({ ...base, items: [] })).toThrow('no items')
    expect(() => parsePack({ ...base, items: 'apple' })).toThrow('no items')
  })

  it('drops malformed and duplicate items but keeps the rest', () => {
    const pack = parsePack({
      ...base,
      items: [
        { id: 'apple', label: 'Apple' },
        { id: 'apple', label: 'Apple again' },
        { id: 'Bad Id', label: 'Bad' },
        { id: 'blank', label: '   ' },
        'pear',
        { id: 'kiwi', label: 'Kiwi', evil: '<script>' },
      ],
    })
    expect(pack.items).toEqual([
      { id: 'apple', label: 'Apple' },
      { id: 'kiwi', label: 'Kiwi' },
    ])
  })

  it('keeps one image source and refuses hosts outside the allow-list', () => {
    const items = parsePack({
      ...base,
      items: [
        { id: 'a', label: 'A', wikipedia: 'Apple', commons: 'File:Apple.jpg' },
        { id: 'b', label: 'B', commons: 'File:Banana.jpg' },
        { id: 'c', label: 'C', commons: 'Banana.jpg' },
        { id: 'd', label: 'D', image: 'https://evil.example/tracker.gif' },
        { id: 'e', label: 'E', image: 'https://static.tvmaze.com/e.jpg' },
      ],
    }).items
    expect(items).toEqual([
      { id: 'a', label: 'A', wikipedia: 'Apple' },
      { id: 'b', label: 'B', commons: 'File:Banana.jpg' },
      { id: 'c', label: 'C' },
      { id: 'd', label: 'D' },
      { id: 'e', label: 'E', image: 'https://static.tvmaze.com/e.jpg' },
    ])
  })

  it('clamps long text and fills defaults for optional metadata', () => {
    const pack = parsePack({
      id: 'x',
      title: 'T'.repeat(500),
      items: [{ id: 'a', label: 'L'.repeat(200) }],
      tiers: ['', 'Good', 42],
    })
    expect(pack.title.length).toBeLessThanOrEqual(120)
    expect(pack.items[0]?.label.length).toBeLessThanOrEqual(80)
    expect(pack.version).toBe('0.0.0')
    expect(pack.tiers).toEqual(['Good'])
  })
})

describe('isAllowedImageUrl', () => {
  it('needs https and an allow-listed host', () => {
    expect(isAllowedImageUrl('https://upload.wikimedia.org/a.jpg')).toBe(true)
    expect(isAllowedImageUrl('http://upload.wikimedia.org/a.jpg')).toBe(false)
    expect(isAllowedImageUrl('https://upload.wikimedia.org.evil.example/a.jpg')).toBe(false)
    expect(isAllowedImageUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedImageUrl('nonsense')).toBe(false)
  })
})
