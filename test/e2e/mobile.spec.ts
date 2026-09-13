// Mobile shell (<1024px): bottom tab bar, docked timer card, picker as a
// bottom sheet. Runs in the `mobile` project only — 390×844 with touch.
import { expect, test } from './helpers/test'
import { clearRunningTimer, createEntry, deleteEntriesNamed, listEntries } from './helpers/api'
import { entryRow, group, picker, timerClock, timerInput, timerPlus, timerToggle } from './helpers/dom'
import { uniqueName } from './helpers/fixtures'

const VIEWPORT = { width: 390, height: 844 }
const TIMER_NAME = uniqueName('E2E mobile timer')

/** Every name a test in this file creates, so afterEach can sweep them all. */
const created = new Set<string>()

function name(prefix: string): string {
  const n = uniqueName(prefix)
  created.add(n)
  return n
}

/** A fixed early-morning slot today — never collides with the seed's 9:05/11:30/13:00 rows. */
function slot(hour: number, minutes = 30) {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0)
  return { start: start.toISOString(), end: new Date(start.getTime() + minutes * 60_000).toISOString() }
}

test.describe('mobile shell', { tag: '@mobile' }, () => {
  test.beforeEach(async ({ api }) => {
    await clearRunningTimer(api)
  })

  test.afterEach(async ({ api }) => {
    await clearRunningTimer(api)
    await deleteEntriesNamed(api, TIMER_NAME, ...created)
    created.clear()
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
    await picker(page).getByRole('combobox').fill('Homepage hero')
    await expect(picker(page).getByRole('option', { name: /^Homepage hero/ })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(picker(page)).toBeHidden()
  })

  test('Select mode: bulk-mark two rows billable, then toggling off clears the selection', async ({ page, api }) => {
    const first = name('E2E mobile select one')
    const second = name('E2E mobile select two')
    await createEntry(api, { name: first, billable: false, ...slot(2) })
    await createEntry(api, { name: second, billable: false, ...slot(3) })

    await page.goto('/time')
    const today = group(page, 'Today')
    await expect(entryRow(today, first)).toBeVisible()

    // Off by default: no checkbox.
    const selectBtn = page.getByRole('button', { name: 'Select', exact: true })
    await expect(selectBtn).toHaveAttribute('aria-pressed', 'false')
    await expect(entryRow(today, first).getByRole('checkbox', { name: 'Select entry' })).toBeHidden()

    await selectBtn.click()
    const doneBtn = page.getByRole('button', { name: 'Done', exact: true })
    await expect(doneBtn).toHaveAttribute('aria-pressed', 'true')

    await entryRow(today, first).getByRole('checkbox', { name: 'Select entry' }).click()
    await entryRow(today, second).getByRole('checkbox', { name: 'Select entry' }).click()
    await expect(page.getByText('2 selected')).toBeVisible()

    // Mobile rows show no billable indicator at all (that's the point — the
    // per-row $ toggle stays desktop-only); verify the bulk action landed
    // through the API instead, same as the bulk bar itself would confirm it.
    await page.getByRole('button', { name: 'Mark billable' }).click()
    await expect(page.getByText('2 selected')).toBeHidden()
    const afterBillable = await listEntries(api)
    for (const n of [first, second]) {
      expect(afterBillable.find(e => e.name === n)?.billable, `${n} billable after bulk mark`).toBe(true)
    }

    // Toggling off drops any selection and hides the checkboxes again.
    await entryRow(today, first).getByRole('checkbox', { name: 'Select entry' }).click()
    await expect(page.getByText('1 selected')).toBeVisible()
    await doneBtn.click()
    await expect(selectBtn).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByText('1 selected')).toBeHidden()
    await expect(entryRow(today, first).getByRole('checkbox', { name: 'Select entry' })).toBeHidden()
  })
})
