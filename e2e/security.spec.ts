import { readFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'

/**
 * Runs the real app under the production response headers from dist/_headers
 * (vite preview does not apply them), including the strict CSP and Trusted
 * Types, and exercises every path that touches a guarded sink: pasted data:
 * images, pasted HTML (DOMParser), the image worker (new Worker), and a .peck
 * backup round trip (header-only image sizing). Any CSP or Trusted Types
 * violation fails the test.
 */

function productionHeaders(): Record<string, string> {
  const text = readFileSync(new URL('../dist/_headers', import.meta.url), 'utf8')
  const block = text.split(/\n(?=\S)/).find((b) => b.startsWith('/*\n')) ?? ''
  const headers: Record<string, string> = {}
  for (const line of block.split('\n').slice(1)) {
    const m = /^\s+([\w-]+):\s*(.+)$/.exec(line)
    if (m?.[1] && m[2]) headers[m[1].toLowerCase()] = m[2]
  }
  return headers
}

const HEADERS = productionHeaders()

async function openWithProductionHeaders(page: Page): Promise<string[]> {
  const violations: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /Content Security Policy|Trusted Type/i.test(msg.text())) {
      violations.push(msg.text())
    }
  })
  await page.exposeFunction('reportViolation', (v: string) => violations.push(v))
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      ;(window as unknown as { reportViolation(v: string): void }).reportViolation(
        `${e.violatedDirective} blocked ${e.blockedURI || 'inline'} (${e.sample})`,
      )
    })
  })
  await page.route('**/*', async (route) => {
    const response = await route.fetch()
    // Strip HSTS so localhost is not pinned to https in the test browser.
    const { 'strict-transport-security': _hsts, ...rest } = HEADERS
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        ...rest,
        // upgrade-insecure-requests would send every request to https://localhost.
        'content-security-policy': (rest['content-security-policy'] ?? '').replace(
          /;\s*upgrade-insecure-requests/,
          '',
        ),
      },
    })
  })
  // The home page first, then a fresh board through the real start flow.
  await page.goto('/')
  await page.getByRole('button', { name: /Start ranking/ }).click()
  await expect(page).toHaveURL(/\/b\/[\w-]+$/)
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible()
  return violations
}

/** A real PNG made by the browser itself, as a data: URL. */
const pngDataUrl = (page: Page, color: string) =>
  page.evaluate((fill) => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 48
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no canvas')
    ctx.fillStyle = fill
    ctx.fillRect(0, 0, 64, 48)
    return canvas.toDataURL('image/png')
  }, color)

const tiles = (page: Page) => page.locator('[data-item-id] img')

test.describe('production security headers', () => {
  test.skip(({ isMobile }) => isMobile, 'header behaviour is the same on every viewport')

  test('the built headers carry a strict CSP with Trusted Types and no unsafe-inline', () => {
    const csp = HEADERS['content-security-policy'] ?? ''
    expect(csp).toContain("require-trusted-types-for 'script'")
    expect(csp).toContain('trusted-types pecking-order')
    expect(csp).toMatch(/style-src 'self' 'sha256-[A-Za-z0-9+/=]+'/)
    expect(csp).not.toContain('unsafe-inline')
    expect(csp).not.toContain('unsafe-eval')
    expect(csp).not.toContain('inline-style-hashes')
  })

  test('boots, renders the shell styles and adds images with zero violations', async ({ page }) => {
    const violations = await openWithProductionHeaders(page)

    // Pasted data: image: decoded in JS (connect-src has no data:), processed in the worker.
    const red = await pngDataUrl(page, '#c0392b')
    await page.evaluate((text) => {
      const dt = new DataTransfer()
      dt.setData('text/plain', text)
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }))
    }, red)
    await expect(tiles(page)).toHaveCount(1)

    // Pasted HTML goes through DOMParser, which Trusted Types guards.
    const blue = await pngDataUrl(page, '#2c3e8f')
    await page.evaluate((src) => {
      const dt = new DataTransfer()
      dt.setData('text/html', `<p>hi</p><img src="${src}" alt="Blue square" onerror="alert(1)">`)
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }))
    }, blue)
    await expect(tiles(page)).toHaveCount(2)
    await expect(page.locator('[data-item-id]', { hasText: 'Blue square' })).toHaveCount(1)

    // A dropped file takes the worker path.
    await page.evaluate(async () => {
      const canvas = new OffscreenCanvas(40, 40)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('no canvas')
      ctx.fillStyle = '#27ae60'
      ctx.fillRect(0, 0, 40, 40)
      const blob = await canvas.convertToBlob({ type: 'image/png' })
      const dt = new DataTransfer()
      dt.items.add(new File([blob], 'green.png', { type: 'image/png' }))
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }))
    })
    await expect(tiles(page)).toHaveCount(3)
    await expect(tiles(page).first()).toHaveAttribute('src', /^blob:/)

    expect(violations).toEqual([])
  })

  test('animated surfaces (drag, Peck-off, export) run with zero violations', async ({ page }) => {
    const violations = await openWithProductionHeaders(page)
    await page.locator('#quick-add').fill(['Kiwi', 'Lime', 'Mango', 'Nectarine'].join('\n'))
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-item-id]')).toHaveCount(4)

    // Peck-off swaps cards with AnimatePresence popLayout, which injects a <style>.
    await page.getByRole('button', { name: 'Peck-off' }).click()
    await page.getByRole('button', { name: /Rank the Coop/ }).click()
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('ArrowLeft')
      await page.waitForTimeout(150)
    }
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Export', exact: true }).click()
    await expect(page.locator('img[alt^="Export preview"]')).toBeVisible()
    expect(violations).toEqual([])
  })

  test('refuses a pixel flood and a private-network link without a request', async ({ page }) => {
    const violations = await openWithProductionHeaders(page)
    const requests: string[] = []
    page.on('request', (r) => requests.push(r.url()))

    await page.evaluate(() => {
      const dt = new DataTransfer()
      dt.setData('text/plain', 'http://192.168.1.1/camera.png')
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }))
    })
    // Refused as an image link, it is kept as a plain text card and never fetched.
    await expect(page.locator('[data-item-id]', { hasText: '192.168.1.1' })).toHaveCount(1)
    expect(requests.some((u) => u.includes('192.168.1.1'))).toBe(false)

    // 30000 x 30000 declared in the PNG header: refused before any decode.
    await page.evaluate(() => {
      const png = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0,
        0x75, 0x30, 0, 0, 0x75, 0x30, 8, 6, 0, 0, 0,
      ])
      const dt = new DataTransfer()
      dt.items.add(new File([png], 'flood.png', { type: 'image/png' }))
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }))
    })
    await expect(page.getByText(/too large to open/)).toBeVisible()
    await expect(tiles(page)).toHaveCount(0)
    expect(violations).toEqual([])
  })

  test('a .peck backup round-trips its images under the production CSP', async ({ page }) => {
    const violations = await openWithProductionHeaders(page)
    for (const color of ['#8e44ad', '#f39c12']) {
      const url = await pngDataUrl(page, color)
      await page.evaluate((text) => {
        const dt = new DataTransfer()
        dt.setData('text/plain', text)
        window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }))
      }, url)
    }
    await expect(tiles(page)).toHaveCount(2)

    await page.getByRole('button', { name: 'View and settings' }).click()
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: /Back up this board/ }).click(),
    ])
    const bytes = readFileSync((await download.path()) ?? '')

    await page.evaluate(
      (data) => {
        const dt = new DataTransfer()
        dt.items.add(new File([new Uint8Array(data)], 'backup.peck'))
        window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }))
      },
      [...bytes],
    )
    await expect(page.getByText(/^Restored/)).toBeVisible()
    await expect(page.getByText(/damaged/)).toHaveCount(0)
    await expect(tiles(page)).toHaveCount(2)
    expect(violations).toEqual([])
  })
})
