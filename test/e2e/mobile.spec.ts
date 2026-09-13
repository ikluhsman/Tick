// Mobile shell (<1024px): bottom tab bar, docked timer card, picker as a
// bottom sheet. Runs in the `mobile` project only — 390×844 with touch.
import { expect, test } from './helpers/test'
import { clearRunningTimer, deleteEntriesNamed } from './helpers/api'
import { entryRow, group, picker, timerClock, timerInput, timerPlus, timerToggle } from './helpers/dom'
import { uniqueName } from './helpers/fixtures'

const VIEWPORT = { width: 390, height: 844 }
const TIMER_NAME = uniqueName('E2E mobile timer')

test.describe('mobile shell', { tag: '@mobile' }, () => {
  test.beforeEach(async ({ api }) => {
    await clearRunningTimer(api)
  })

  test.afterEach(async ({ api }) => {
    await clearRunningTimer(api)
    await deleteEntriesNamed(api, TIMER_NAME)
  })

  test('the bottom tab bar navigates', async ({ page }) => {
    await page.goto('/')
    const tabs = page.getByRole('navigation', { name: 'Primary' })
    await expect(tabs).toBeVisible()

    await tabs.getByRole('link', { name: 'Time' }).click()
    await page.waitForURL('**/time')
    await expect(tabs.getByRole('link', { name: 'Time' })).toHaveAttribute('aria-current', 'page')

    await tabs.getByRole('link', { name: 'Calendar' }).click()
    await page.waitForURL('**/calendar')
    await expect(tabs.getByRole('link', { name: 'Calendar' })).toHaveAttribute('aria-current', 'page')

    await tabs.getByRole('link', { name: 'Dashboard' }).click()
    await page.waitForURL(url => new URL(url).pathname === '/')
  })

  test('the docked timer starts and stops', async ({ page }) => {
    await page.goto('/time')

    await timerInput(page).fill(TIMER_NAME)
    await expect(timerToggle(page)).toHaveAccessibleName('Start')
    await timerToggle(page).click()
    await expect(timerToggle(page)).toHaveAccessibleName('Stop')
    await expect(timerClock(page)).toHaveText(/^00:00:0[2-9]$/, { timeout: 15_000 })

    await timerToggle(page).click()
    await expect(timerToggle(page)).toHaveAccessibleName('Start')
    await page.waitForURL('**/time')
    await expect(entryRow(group(page, 'Today'), TIMER_NAME)).toBeVisible()
  })

  test('the picker opens as a bottom sheet', async ({ page }) => {
    await page.goto('/time')

    await timerPlus(page).click()
    await expect(picker(page)).toBeVisible()

    // Docked to the bottom edge, full width — the <640px sheet layout.
    // Polled, because the dialog animates in.
    await expect.poll(async () => {
      const b = await picker(page).boundingBox()
      return b && { x: Math.round(b.x), width: Math.round(b.width), bottom: Math.round(b.y + b.height) }
    }).toEqual({ x: 0, width: VIEWPORT.width, bottom: VIEWPORT.height })

    // It is the real picker: tabs and a searchable list.
    await expect(picker(page).getByRole('tab', { name: 'Task' })).toBeVisible()
    await picker(page).getByRole('textbox').fill('Homepage hero')
    await expect(picker(page).getByRole('button', { name: /^Homepage hero/ })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(picker(page)).toBeHidden()
  })
})
