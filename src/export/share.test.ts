import { afterEach, describe, expect, it, vi } from 'vitest'
import { canShareFiles, copyImageToClipboard, downloadBlob, fileNameFor, shareImage } from './share'

const png = () => new Blob(['png'], { type: 'image/png' })

function setNavigator(key: string, value: unknown) {
  Object.defineProperty(navigator, key, { value, configurable: true, writable: true })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  for (const key of ['clipboard', 'share', 'canShare']) {
    Reflect.deleteProperty(navigator, key)
  }
})

it('fileNameFor slugs titles', () => {
  expect(fileNameFor('Fruit, ranked!')).toBe('fruit-ranked.png')
  expect(fileNameFor('???')).toBe('pecking-order.png')
})

describe('downloadBlob', () => {
  it('clicks a temporary download link and revokes the URL afterwards', () => {
    vi.useFakeTimers()
    const create = vi.fn(() => 'blob:test')
    const revoke = vi.fn()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('fruit.png')
      expect(this.href).toBe('blob:test')
    })

    downloadBlob(png(), 'fruit.png')
    expect(click).toHaveBeenCalledOnce()
    expect(document.querySelector('a[download]')).toBeNull()
    expect(revoke).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(revoke).toHaveBeenCalledWith('blob:test')
  })
})

describe('copyImageToClipboard', () => {
  it('returns false when ClipboardItem is unsupported', async () => {
    vi.stubGlobal('ClipboardItem', undefined)
    expect(await copyImageToClipboard(Promise.resolve(png()))).toBe(false)
  })

  it('writes a ClipboardItem built from the promise itself', async () => {
    const items: Record<string, unknown>[] = []
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor(readonly data: Record<string, unknown>) {
          items.push(data)
        }
      },
    )
    const write = vi.fn(async () => {})
    setNavigator('clipboard', { write })
    const pending = Promise.resolve(png())
    expect(await copyImageToClipboard(pending)).toBe(true)
    expect(write).toHaveBeenCalledOnce()
    expect(items[0]?.['image/png']).toBe(pending)
  })

  it('returns false when the write is rejected', async () => {
    vi.stubGlobal('ClipboardItem', class {})
    setNavigator('clipboard', { write: vi.fn(async () => Promise.reject(new Error('denied'))) })
    expect(await copyImageToClipboard(Promise.resolve(png()))).toBe(false)
  })
})

describe('Web Share', () => {
  it('canShareFiles feature-detects file sharing', () => {
    expect(canShareFiles()).toBe(false)
    setNavigator(
      'canShare',
      vi.fn(() => true),
    )
    expect(canShareFiles()).toBe(true)
    setNavigator(
      'canShare',
      vi.fn(() => false),
    )
    expect(canShareFiles()).toBe(false)
  })

  it('shares a named PNG file', async () => {
    const share = vi.fn(async (_data: ShareData) => {})
    setNavigator('share', share)
    setNavigator('canShare', () => true)
    expect(await shareImage(png(), 'Fruit, ranked')).toBe(true)
    const file = share.mock.calls[0]![0].files![0]!
    expect(file.name).toBe('fruit-ranked.png')
    expect(file.type).toBe('image/png')
  })

  it('returns false when unsupported or the user cancels', async () => {
    expect(await shareImage(png(), 'x')).toBe(false)
    setNavigator('canShare', () => true)
    setNavigator(
      'share',
      vi.fn(async () => Promise.reject(new DOMException('cancelled', 'AbortError'))),
    )
    expect(await shareImage(png(), 'x')).toBe(false)
  })

  it('resolves false instead of throwing when the browser refuses', async () => {
    setNavigator('canShare', () => true)
    setNavigator(
      'share',
      vi.fn(async () => Promise.reject(new DOMException('no gesture', 'NotAllowedError'))),
    )
    expect(await shareImage(png(), 'x')).toBe(false)
  })
})
