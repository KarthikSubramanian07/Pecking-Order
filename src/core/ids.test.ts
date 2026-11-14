import { describe, expect, it } from 'vitest'
import { isSafeKey, newId } from './ids'

describe('newId', () => {
  it('makes unique prefixed ids from the unambiguous alphabet', () => {
    const ids = new Set(Array.from({ length: 5000 }, () => newId('i')))
    expect(ids.size).toBe(5000)
    for (const id of ids) expect(id).toMatch(/^i_[2-9a-hjkmnp-z]{12}$/)
  })
})

describe('isSafeKey', () => {
  it('refuses keys that Object.prototype owns', () => {
    for (const key of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
      expect(isSafeKey(key)).toBe(false)
    }
    expect(isSafeKey('t_abc234def567')).toBe(true)
    expect(isSafeKey('coop')).toBe(true)
  })
})
