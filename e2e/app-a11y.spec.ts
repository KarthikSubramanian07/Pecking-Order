import AxeBuilder from '@axe-core/playwright'
import { expect, type Locator, type Page, test } from '@playwright/test'

/**
 * Accessibility checks for the running app (WCAG 2.2 AA): axe on every
 * surface in both themes, a keyboard-only ranking session, and reflow at
 * 320px. Everything here stays offline: no image search, no packs.
 */

const ITEMS = ['Apple', 'Banana', 'Cherry', 'Damson', 'Elderberry', 'Fig', 'Grape', 'Huckleberry']

async function expectNoSeriousViolations(page: Page, surface: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    surface,
  ).toEqual([])
}

/** Starts a board from the home page with the keyboard, like a first-time visitor. */
async function openBoard(page: Page) {
  await page.goto('/')
  await expectNoSeriousViolations(page, 'home page')
  await page.locator('#start-title').fill('Fruit')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/b\//)
  await expect(page.locator('#quick-add')).toBeVisible()
}

/** Types each item into the quick-add field and presses Enter, as a keyboard user would. */
async function addItems(page: Page, labels: readonly string[] = ITEMS) {
  const field = page.locator('#quick-add')
  await field.focus()
  for (const label of labels) {
    await page.keyboard.type(label)
    await page.keyboard.press('Enter')
  }
  await expect(page.locator('[data-item-id]')).toHaveCount(labels.length)
}

const tile = (page: Page, label: string) =>
  page.locator('[data-item-id]').filter({ hasText: new RegExp(`^${label}$`) })
const tier = (page: Page, label: string) =>
  page.getByRole('region', { name: new RegExp(`^Tier ${label}, `) })
const coop = (page: Page) => page.getByRole('region', { name: 'The Coop' })

async function expectFocused(locator: Locator) {
  await expect(locator).toBeFocused()
}

test.describe('axe, populated board and every dialog', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`no serious violations (${scheme})`, async ({ page }) => {
      // Reduced motion settles entrance animations, so axe measures final colours.
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await openBoard(page)
      await expectNoSeriousViolations(page, 'empty board')

      await addItems(page)
      await tile(page, 'Apple').focus()
      await page.keyboard.press('1')
      await expectNoSeriousViolations(page, 'populated board with a toast')

      await tile(page, 'Banana').click()
      await expect(page.getByRole('button', { name: /^Place here in Tier S$/ })).toBeVisible()
      await expectNoSeriousViolations(page, 'tap-to-place selection')
      await page.keyboard.press('Escape')

      await page.getByRole('button', { name: 'Tier S settings' }).click()
      await expect(page.getByRole('dialog', { name: 'Tier S settings' })).toBeVisible()
      await expectNoSeriousViolations(page, 'tier settings popover')
      await page.keyboard.press('Escape')

      await page.getByRole('button', { name: 'View and settings' }).click()
      await expect(page.getByRole('menu', { name: 'View and settings' })).toBeVisible()
      await expectNoSeriousViolations(page, 'settings menu')
      await page.keyboard.press('Escape')

      const dialogs: [string, (p: Page) => Promise<void>][] = [
        ['New pecking order', (p) => p.getByRole('button', { name: 'New', exact: true }).click()],
        ['Export image', (p) => p.getByRole('button', { name: 'Export', exact: true }).click()],
        [
          'Search free images',
          (p) => p.getByRole('button', { name: 'Search', exact: true }).click(),
        ],
        ['Keyboard shortcuts', (p) => p.locator('body').press('?')],
        [
          'Edit item',
          async (p) => {
            await tile(p, 'Cherry').focus()
            await p.keyboard.press('e')
          },
        ],
        ['Peck-off', (p) => p.getByRole('button', { name: 'Peck-off', exact: true }).click()],
      ]
      for (const [title, open] of dialogs) {
        await open(page)
        const dialog = page.getByRole('dialog', { name: title })
        await expect(dialog).toBeVisible()
        await expectNoSeriousViolations(page, `${title} dialog`)
        if (title === 'Peck-off') {
          await dialog.getByRole('button', { name: /^Rank the Coop/ }).click()
          await expect(dialog.getByRole('progressbar')).toBeVisible()
          await expectNoSeriousViolations(page, 'Peck-off mid-game')
        }
        await page.keyboard.press('Escape')
        await expect(dialog).toBeHidden()
      }
    })
  }
})

test.describe('keyboard only', () => {
  test('add, rank, drag, undo and close a dialog without a pointer', async ({ page }) => {
    await openBoard(page)
    await addItems(page, ['Apple', 'Banana', 'Cherry'])

    // Shift+Tab from the quick-add field reaches the last tile in the Coop.
    await page.keyboard.press('Shift+Tab')
    await expectFocused(tile(page, 'Cherry'))

    // A number key sends the focused item to that tier, and focus follows it.
    await page.keyboard.press('1')
    await expect(tier(page, 'S').locator('[data-item-id]')).toHaveText(['Cherry'])
    await expectFocused(tile(page, 'Cherry'))

    // Keyboard drag: Space picks up, arrows move between rows, Space drops.
    await tile(page, 'Banana').focus()
    await page.keyboard.press('Space')
    await expect(page.getByText(/^Picked up Banana\./)).toBeAttached()
    // dnd-kit attaches its arrow-key listener on the tick after pickup so the
    // Space press isn't read as a move; a human can't press faster than this.
    await page.waitForTimeout(150)
    // Each ArrowUp moves it one row up (F, D, C, B, A). Wait for every
    // announcement before the next key, as a screen reader user would.
    for (const row of ['F', 'D', 'C', 'B', 'A']) {
      await page.keyboard.press('ArrowUp')
      await expect(page.getByText(new RegExp(`^Banana is in tier ${row},`))).toBeAttached()
    }
    await page.keyboard.press('Space')
    await expect(tier(page, 'A').locator('[data-item-id]')).toHaveText(['Banana'])
    await expect(page.getByText(/^Dropped Banana in tier A/)).toBeAttached()
    await expectFocused(tile(page, 'Banana'))

    // Undo puts it back in the Coop and keeps focus on the same item.
    await page.keyboard.press('ControlOrMeta+z')
    await expect(coop(page).locator('[data-item-id]', { hasText: 'Banana' })).toHaveCount(1)
    await expect(tier(page, 'A').locator('[data-item-id]')).toHaveCount(0)
    await expectFocused(tile(page, 'Banana'))

    // Escape closes a dialog and hands focus back to the button that opened it.
    const exportButton = page.getByRole('button', { name: 'Export', exact: true })
    await exportButton.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Export image' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expectFocused(exportButton)

    // Deleting the focused item moves focus to its neighbour, not to <body>.
    await tile(page, 'Apple').focus()
    await page.keyboard.press('Delete')
    await expect(tile(page, 'Apple')).toHaveCount(0)
    await expectFocused(tile(page, 'Banana'))
  })

  test('the settings menu works with arrow keys and Escape', async ({ page }) => {
    await openBoard(page)
    const trigger = page.getByRole('button', { name: 'View and settings' })
    await trigger.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menuitemradio', { name: 'Light theme' })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await trigger.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menuitemradio', { name: 'Dark theme' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await page.keyboard.press('Escape')
    await expectFocused(trigger)
  })
})

test.describe('reflow', () => {
  test('no horizontal scrolling at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await openBoard(page)
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
    expect(await overflow()).toBe(0)
    await addItems(page)
    expect(await overflow()).toBe(0)
    // Selecting an item adds "Place here" and "Back to the Coop" buttons.
    await tile(page, 'Apple').click()
    await expect(page.getByRole('button', { name: 'Back to the Coop' })).toBeVisible()
    expect(await overflow()).toBe(0)
    // Upload and Search stay available on narrow screens.
    await expect(page.getByRole('button', { name: 'Upload', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeVisible()
  })
})
