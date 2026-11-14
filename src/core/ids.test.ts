import { describe, expect, it } from 'vitest'
import { newId } from './ids'

describe('newId', () => {
  it('makes unique prefixed ids from the unambiguous alphabet', () => {
    const ids = new Set(Array.from({ length: 5000 }, () => newId('i')))
    expect(ids.size).toBe(5000)
    for (const id of ids) expect(id).toMatch(/^i_[2-9a-hjkmnp-z]{12}$/)
  })
})
