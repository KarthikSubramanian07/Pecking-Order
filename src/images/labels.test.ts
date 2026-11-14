import { describe, expect, it } from 'vitest'
import { cleanText, isHiddenName, labelFromFileName, labelFromUrl } from './labels'

describe('labelFromFileName', () => {
  it('drops the extension and turns separators into spaces', () => {
    expect(labelFromFileName('tom_hanks--2016.JPG')).toBe('tom hanks 2016')
    expect(labelFromFileName('  Pad   Thai .webp')).toBe('Pad Thai')
  })

  it('keeps dots that are not an extension', () => {
    expect(labelFromFileName('Dr. Strangelove.png')).toBe('Dr. Strangelove')
  })

  it('caps the length at 80 characters', () => {
    expect(labelFromFileName(`${'a'.repeat(200)}.png`)).toHaveLength(80)
  })

  it('never returns an empty label', () => {
    expect(labelFromFileName('__.png')).toBe('Untitled')
  })
})

describe('labelFromUrl', () => {
  it('uses the decoded last path segment', () => {
    expect(labelFromUrl(new URL('https://x.org/img/Pad_Thai%20(1).jpg?w=500'))).toBe('Pad Thai (1)')
  })

  it('falls back to the host, and names pasted data', () => {
    expect(labelFromUrl(new URL('https://example.com/'))).toBe('example.com')
    expect(labelFromUrl(new URL('data:image/png;base64,AAAA'))).toBe('Pasted image')
  })
})

describe('cleanText', () => {
  it('collapses whitespace but keeps hyphens', () => {
    expect(cleanText('  Spider-Man \n  2 ')).toBe('Spider-Man 2')
  })
})

describe('isHiddenName', () => {
  it('flags OS junk', () => {
    expect(isHiddenName('.DS_Store')).toBe(true)
    expect(isHiddenName('__MACOSX')).toBe(true)
    expect(isHiddenName('cat.png')).toBe(false)
  })
})
