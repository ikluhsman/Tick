// Dashboard activity heatmap (app/components/dashboard/ActivityGrid.vue):
// roving-tabindex keyboard grid. Covers the a11y-followups fixes that a
// visual axe sweep can't catch on its own — opacity-driven focus-ring
// contrast and Ctrl+Home/End — plus the default tab stop landing on a real
// (not future) day.
import { expect, test } from '@playwright/test'

function grid(page: import('@playwright/test').Page) {
  return page.getByRole('grid', { name: /Weekday activity heatmap/ })
}

test.describe('dashboard activity heatmap', () => {
  test('the focusable gridcell stays at full opacity — intensity lives on an inner dot', async ({ page }) => {
    await page.goto('/')
    const cell = grid(page).locator('[role="gridcell"][tabindex="0"]')
    await cell.focus()
    // dotStyle()'s opacity (0.1 for a zero-hour day, up to 1.0) must land on
    // an inner aria-hidden span, never on the tabbable gridcell itself —
    // `opacity` on the focused element would fade the focus-visible outline
    // (main.css) right along with it, regardless of what value it fades to.
    await expect(cell).toHaveCSS('opacity', '1')
  })

  test('Ctrl+Home and Ctrl+End jump to the grid\'s first and last cell', async ({ page }) => {
    await page.goto('/')
    const cells = grid(page).locator('[role="gridcell"]')
    const first = cells.first()
    const last = cells.last()

    const defaultTabbable = grid(page).locator('[role="gridcell"][tabindex="0"]')
    await defaultTabbable.focus()

    await page.keyboard.press('Control+Home')
    await expect(first).toBeFocused()

    await page.keyboard.press('Control+End')
    await expect(last).toBeFocused()
  })

  test('the default tabbable cell is never a future day', async ({ page }) => {
    await page.goto('/')
    const cell = grid(page).locator('[role="gridcell"][tabindex="0"]')
    const label = await cell.getAttribute('aria-label')
    expect(label).toBeTruthy()
    // dotTitle() renders "{Weekday, Mon D} · {Nh / no time logged}" via
    // toLocaleDateString — parse that back out and compare to today, rather
    // than special-casing "no time logged" (a real past day can log 0h too).
    const datePart = label!.split(' · ')[0]!
    const parsed = new Date(`${datePart}, ${new Date().getFullYear()}`)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    parsed.setHours(0, 0, 0, 0)
    expect(parsed.getTime()).toBeLessThanOrEqual(today.getTime())
  })
})
