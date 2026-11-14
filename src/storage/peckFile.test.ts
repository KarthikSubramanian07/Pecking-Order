// @vitest-environment node
import { strToU8, zipSync } from 'fflate'
import { beforeEach, describe, expect, it } from 'vitest'
import { createBoard, opAddItems } from '@/core/board'
import { getImage, putImage, resetDbForTests } from './db'
import { exportPeck, importPeck, sniffImageType } from './peckFile'

/** Signature plus an IHDR chunk declaring a 2 × 3 image: all an import reads. */
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2,
  0, 0, 0, 3, 8, 6, 0, 0, 0,
])

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
    const { board: restored, skippedImages } = await importPeck(new Blob([zip as BlobPart]))
    expect(skippedImages).toBe(1)
    expect(Object.values(restored.items)[0]?.image).toBeUndefined()
  })

  it('rejects non-peck files', async () => {
    await expect(importPeck(new Blob(['hello']))).rejects.toThrow(/\.peck/)
    const zip = zipSync({ 'board.json': strToU8('{}') })
    await expect(importPeck(new Blob([zip as BlobPart]))).rejects.toThrow(/\.peck/)
  })

  it('sniffs image types by magic bytes', () => {
    expect(sniffImageType(PNG)).toBe('image/png')
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0]))).toBe('image/jpeg')
    expect(sniffImageType(strToU8('<svg onload=alert(1)>'))).toBeNull()
  })
})

const manifest = () => strToU8(JSON.stringify({ format: 'pecking-order', version: 1 }))

/** Rewrites the uncompressed size every central directory entry declares. */
function declareSizes(zip: Uint8Array, size: number, match: (name: string) => boolean) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  for (let i = 0; i + 46 <= zip.length; i++) {
    if (view.getUint32(i, true) !== 0x02014b50) continue
    const nameLength = view.getUint16(i + 28, true)
    const name = new TextDecoder().decode(zip.subarray(i + 46, i + 46 + nameLength))
    if (match(name)) view.setUint32(i + 24, size, true)
  }
  return zip
}

describe('.peck imports against hostile files', () => {
  it('refuses a referenced image entry that inflates past the per-image cap', async () => {
    const board = createBoard()
    const h = 'b'.repeat(64)
    opAddItems(board, [{ label: 'Bomb', image: h }])
    const zip = zipSync({
      'peck.json': manifest(),
      'board.json': strToU8(JSON.stringify(board)),
      [`images/${h}`]: new Uint8Array(6 * 1024 * 1024),
    })
    await expect(importPeck(new Blob([zip as BlobPart]))).rejects.toThrow(/too much/)
  })

  it('never inflates image entries the board does not reference', async () => {
    const board = createBoard()
    opAddItems(board, [{ label: 'Text only' }])
    const files: Record<string, Uint8Array> = {
      'peck.json': manifest(),
      'board.json': strToU8(JSON.stringify(board)),
    }
    for (let i = 0; i < 20; i++) files[`images/${i.toString(16).padStart(64, '0')}`] = PNG
    const zip = declareSizes(zipSync(files), 0xffffffff, (n) => n.startsWith('images/'))
    const { board: restored, skippedImages } = await importPeck(new Blob([zip as BlobPart]))
    expect(restored.title).toBe(board.title)
    expect(skippedImages).toBe(0)
  })

  it('caps the total inflated size across all entries', async () => {
    const board = createBoard()
    const hashes = Array.from({ length: 60 }, (_, i) => i.toString(16).padStart(64, 'c'))
    opAddItems(
      board,
      hashes.map((image) => ({ label: image.slice(0, 4), image })),
    )
    const files: Record<string, Uint8Array> = {
      'peck.json': manifest(),
      'board.json': strToU8(JSON.stringify(board)),
    }
    for (const h of hashes) files[`images/${h}`] = PNG
    // Each entry claims just under the per-image cap; 60 of them blow the budget.
    const zip = declareSizes(zipSync(files), 5 * 1024 * 1024 - 1, (n) => n.startsWith('images/'))
    await expect(importPeck(new Blob([zip as BlobPart]))).rejects.toThrow(/too much/)
  })

  it('skips images whose header declares an implausible size', async () => {
    const huge = new Uint8Array(PNG)
    new DataView(huge.buffer).setUint32(16, 60_000)
    new DataView(huge.buffer).setUint32(20, 60_000)
    const h = await hash(huge)
    const board = createBoard()
    opAddItems(board, [{ label: 'Flood', image: h }])
    const zip = zipSync({
      'peck.json': manifest(),
      'board.json': strToU8(JSON.stringify(board)),
      [`images/${h}`]: huge,
    })
    const { board: restored, skippedImages } = await importPeck(new Blob([zip as BlobPart]))
    expect(skippedImages).toBe(1)
    expect(Object.values(restored.items)[0]?.image).toBeUndefined()
    expect(await getImage(h)).toBeUndefined()
  })

  it('stores the size read from the header, without decoding', async () => {
    const h = await hash(PNG)
    const board = createBoard()
    opAddItems(board, [{ label: 'Tile', image: h }])
    const zip = zipSync({
      'peck.json': manifest(),
      'board.json': strToU8(JSON.stringify(board)),
      [`images/${h}`]: PNG,
    })
    await importPeck(new Blob([zip as BlobPart]))
    expect(await getImage(h)).toMatchObject({ width: 2, height: 3 })
  })

  it.each(['null', '"pecking-order"', '{"format":"pecking-order"'])(
    'rejects a malformed manifest (%s) with a friendly message',
    async (text) => {
      const zip = zipSync({ 'peck.json': strToU8(text), 'board.json': strToU8('{}') })
      await expect(importPeck(new Blob([zip as BlobPart]))).rejects.toThrow(/\.peck file/)
    },
  )

  it('does not take any ISO-BMFF file for AVIF', () => {
    const iso = (brand: string) => strToU8(`\0\0\0\x18ftyp${brand}\0\0\0\0`)
    expect(sniffImageType(iso('avif'))).toBe('image/avif')
    expect(sniffImageType(iso('isom'))).toBeNull()
    expect(sniffImageType(iso('qt  '))).toBeNull()
  })
})
