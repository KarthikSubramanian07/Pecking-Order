import { expect, type Page, test } from '@playwright/test'

/**
 * The board layout: on wide screens the Coop is a sidebar beside the tiers and
 * never covers one; on narrow screens it docks to the bottom and can fold away.
 */

const BIRDS = Array.from({ length: 36 }, (_, i) => `Bird ${i + 1}`)

async function boardWithItems(page: Page) {
  await page.goto('/')
  await page.locator('#start-title').fill('Backyard Birds')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/b\//)
  await page.locator('#quick-add').fill(BIRDS.join('\n'))
  await page.locator('#quick-add').press('Enter')
  await expect(page.locator('[data-item-id]')).toHaveCount(BIRDS.length)
}

const coop = (page: Page) => page.getByRole('region', { name: 'The Coop' })
const tier = (page: Page, label: string) =>
  page.getByRole('region', { name: new RegExp(`^Tier ${label}, `) })

test.describe('wide screens', () => {
  test.skip(({ isMobile }) => isMobile, 'sidebar layout is for wide screens')

  test('the Coop sits beside the tiers and covers none of them', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 680 })
    await boardWithItems(page)
    const dock = await coop(page).boundingBox()
    expect(dock).not.toBeNull()
    for (const label of ['S', 'A', 'B', 'C', 'D', 'F']) {
      const row = await tier(page, label).boundingBox()
      expect(row, `tier ${label}`).not.toBeNull()
      if (!row || !dock) continue
      // Every tier ends left of the sidebar.
      expect(row.x + row.width, `tier ${label}`).toBeLessThanOrEqual(dock.x)
    }
    // Adding items is reachable without scrolling.
    await expect(page.locator('#quick-add')).toBeInViewport()
    // Once the page scrolls, the sidebar sticks and fits the viewport, scrolling its own tiles.
    await page.mouse.wheel(0, 2000)
    await expect
      .poll(async () => {
        const box = await coop(page).boundingBox()
        return box ? box.y >= 0 && box.y + box.height <= 680 : false
      })
      .toBe(true)
  })

  test('a mouse drag from the sidebar lands in a tier', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await boardWithItems(page)
    const from = await page
      .locator('[data-item-id]')
      .filter({ hasText: /^Bird 1$/ })
      .boundingBox()
    const to = await tier(page, 'A').boundingBox()
    if (!from || !to) throw new Error('missing boxes')
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(from.x + 20, from.y + 20, { steps: 4 })
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 })
    await page.mouse.up()
    await expect(tier(page, 'A').getByText('Bird 1', { exact: true })).toBeVisible()
  })
})

test.describe('narrow screens', () => {
  test('the docked Coop folds down to its header and back', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await boardWithItems(page)
    const fold = page.getByRole('button', { name: 'Fold the Coop away' })
    await expect(fold).toHaveAttribute('aria-expanded', 'true')
    const open = (await coop(page).boundingBox())?.height ?? 0
    await fold.click()
    const show = page.getByRole('button', { name: 'Show the Coop' })
    await expect(show).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('#quick-add')).toBeHidden()
    const folded = (await coop(page).boundingBox())?.height ?? 0
    expect(folded).toBeLessThan(open / 2)
    await show.click()
    await expect(page.locator('#quick-add')).toBeVisible()
  })
})
