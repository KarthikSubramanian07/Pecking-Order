import { describe, expect, it } from 'vitest'
import { boardPath, parseRoute } from './router'

describe('router', () => {
  it('parses board and home routes', () => {
    expect(parseRoute('/')).toEqual({ name: 'home' })
    expect(parseRoute('/b/b_abc123')).toEqual({ name: 'board', id: 'b_abc123' })
    expect(parseRoute('/b/b_abc123/')).toEqual({ name: 'board', id: 'b_abc123' })
    expect(parseRoute('/b/../etc')).toEqual({ name: 'home' })
    expect(parseRoute('/b/<script>')).toEqual({ name: 'home' })
  })
  it('builds board paths', () => {
    expect(boardPath('b_x')).toBe('/b/b_x')
  })
})
