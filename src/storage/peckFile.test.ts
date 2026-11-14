// @vitest-environment node
import { strToU8, zipSync } from 'fflate'
import { beforeEach, describe, expect, it } from 'vitest'
import { createBoard, opAddItems } from '@/core/board'
import { getImage, putImage, resetDbForTests } from './db'
import { exportPeck, importPeck, sniffImageType } from './peckFile'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

async function hash(bytes: Uint8Array) {
  const d = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

async function freshDb() {
  await resetDbForTests()
  await new Promise((r) => {
    const req = indexedDB.deleteDatabase('pecking-order')
    req.onsuccess = req.onerror = r
  })
}

beforeEach(freshDb)

describe('.peck files', () => {
  it('round-trips a board with images', async () => {
    const h = await hash(PNG)
    await putImage({
      hash: h,
      blob: new Blob([PNG], { type: 'image/png' }),
      width: 1,
      height: 1,
      createdAt: 1,
    })
    const board = createBoard({ title: 'Snacks' })
    opAddItems(board, [{ label: 'Chips', image: h }, { label: 'Text only' }])
    const file = await exportPeck(board)

    await freshDb()
    const { board: restored, skippedImages } = await importPeck(file)
    expect(skippedImages).toBe(0)
    expect(restored.title).toBe('Snacks')
    expect(
      Object.values(restored.items)
        .map((i) => i.label)
        .sort(),
    ).toEqual(['Chips', 'Text only'])
    expect(await getImage(h)).toBeTruthy()
  })

  it('drops images whose bytes do not match their hash', async () => {
    const board = createBoard()
    const fake = 'a'.repeat(64)
    opAddItems(board, [{ label: 'Liar', image: fake }])
    const zip = zipSync({
      'peck.json': strToU8(JSON.stringify({ format: 'pecking-order', version: 1 })),
      'board.json': strToU8(JSON.stringify(board)),
      [`images/${fake}`]: PNG,
    })
    const { board: restored, skippedImages } = await importPeck(new Blob([zip]))
    expect(skippedImages).toBe(1)
    expect(Object.values(restored.items)[0]?.image).toBeUndefined()
  })

  it('rejects non-peck files', async () => {
    await expect(importPeck(new Blob(['hello']))).rejects.toThrow(/\.peck/)
    const zip = zipSync({ 'board.json': strToU8('{}') })
    await expect(importPeck(new Blob([zip]))).rejects.toThrow(/\.peck/)
  })

  it('sniffs image types by magic bytes', () => {
    expect(sniffImageType(PNG)).toBe('image/png')
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0]))).toBe('image/jpeg')
    expect(sniffImageType(strToU8('<svg onload=alert(1)>'))).toBeNull()
  })
})
