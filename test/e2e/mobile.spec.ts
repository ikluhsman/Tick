// Mobile shell (<1024px): bottom tab bar, docked timer card, picker as a
// bottom sheet. Runs in the `mobile` project only — 390×844 with touch.
import { expect, test } from './helpers/test'
import { clearRunningTimer, createEntry, deleteEntriesNamed, listEntries } from './helpers/api'
import { bulkActionsBar, entryRow, group, picker, timerClock, timerInput, timerPlus, timerToggle } from './helpers/dom'
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

    // Off by default: no checkbox. Select/Done is a plain action button (its
    // changing label is the state cue, not aria-pressed — see time.vue).
    const selectBtn = page.getByRole('button', { name: 'Select', exact: true })
    await expect(selectBtn).toBeVisible()
    await expect(entryRow(today, first).getByRole('checkbox', { name: 'Select entry' })).toBeHidden()

    await selectBtn.click()
    const doneBtn = page.getByRole('button', { name: 'Done', exact: true })
    await expect(doneBtn).toBeVisible()

    await entryRow(today, first).getByRole('checkbox', { name: 'Select entry' }).click()
    await entryRow(today, second).getByRole('checkbox', { name: 'Select entry' }).click()
    // Scoped to the bar: time.vue also keeps an always-mounted live region
    // with the same text, so an unscoped getByText matches both.
    await expect(bulkActionsBar(page).getByText('2 selected')).toBeVisible()

    // Mobile rows show no billable indicator at all (that's the point — the
    // per-row $ toggle stays desktop-only); verify the bulk action landed
    // through the API instead, same as the bulk bar itself would confirm it.
    await page.getByRole('button', { name: 'Mark billable' }).click()
    await expect(bulkActionsBar(page)).toBeHidden()
    const afterBillable = await listEntries(api)
    for (const n of [first, second]) {
      expect(afterBillable.find(e => e.name === n)?.billable, `${n} billable after bulk mark`).toBe(true)
    }

    // Toggling off drops any selection and hides the checkboxes again.
    await entryRow(today, first).getByRole('checkbox', { name: 'Select entry' }).click()
    await expect(bulkActionsBar(page).getByText('1 selected')).toBeVisible()
    await doneBtn.click()
    await expect(selectBtn).toBeVisible()
    await expect(bulkActionsBar(page)).toBeHidden()
    await expect(entryRow(today, first).getByRole('checkbox', { name: 'Select entry' })).toBeHidden()
  })

  test('selection-count live region is always mounted, unlike the bar\'s own visual count', async ({ page, api }) => {
    const first = name('E2E mobile live region')
    await createEntry(api, { name: first, billable: false, ...slot(6) })

    await page.goto('/time')
    const today = group(page, 'Today')
    await expect(entryRow(today, first)).toBeVisible()

    // Present from page load — not only once the bar mounts, which is what
    // a <span role="status"> living inside the v-if'd bar would require,
    // and which meant the very first "n selected" was usually never
    // announced.
    const live = page.locator('[role="status"][aria-live="polite"].sr-only')
    await expect(live).toBeAttached()
    await expect(live).toHaveText('')

    await page.getByRole('button', { name: 'Select', exact: true }).click()
    await entryRow(today, first).getByRole('checkbox', { name: 'Select entry' }).click()
    await expect(live).toHaveText('1 selected')

    await entryRow(today, first).getByRole('checkbox', { name: 'Select entry' }).click()
    await expect(live).toHaveText('Selection cleared')
  })

  test('focus after a bulk action in Select mode lands on the Select/Done toggle, not an off-screen row', async ({ page, api }) => {
    // Enough rows to push well past the fold, same setup as the reachability
    // test above — the row selected sits well below the header.
    const names: string[] = []
    for (let i = 0; i < 20; i++) {
      const n = name(`E2E mobile focus ${i}`)
      names.push(n)
      await createEntry(api, { name: n, billable: false, ...slot(i) })
    }

    await page.goto('/time')
    const today = group(page, 'Today')
    await expect(entryRow(today, names[19]!)).toBeVisible()

    await page.getByRole('button', { name: 'Select', exact: true }).click()

    const lastRow = entryRow(today, names[0]!)
    await lastRow.scrollIntoViewIfNeeded()
    await lastRow.getByRole('checkbox', { name: 'Select entry' }).click()

    const bar = bulkActionsBar(page)
    await expect(bar).toBeVisible()
    await bar.getByRole('button', { name: 'Clear' }).click()
    await expect(bar).toBeHidden()

    // Landing on the header's Select/Done toggle (still reading "Done" —
    // Clear doesn't turn Select mode off) beats the first entry in the
    // whole list: that row sits off-screen after scrolling down to select
    // a row near the bottom, so a sighted keyboard user would lose their
    // focus ring entirely.
    const doneBtn = page.getByRole('button', { name: 'Done', exact: true })
    await expect(doneBtn).toBeFocused()
    await expect(doneBtn).toBeInViewport()
  })

  test('bulk-action bar stays reachable and on-screen once the list scrolls', async ({ page, api }) => {
    // Enough rows to push well past the fold; hour ascending so the lowest
    // hour (oldest) sorts to the very bottom of the "Today" group.
    const names: string[] = []
    for (let i = 0; i < 20; i++) {
      const n = name(`E2E mobile scroll ${i}`)
      names.push(n)
      await createEntry(api, { name: n, billable: false, ...slot(4 + i) })
    }

    await page.goto('/time')
    const today = group(page, 'Today')
    await expect(entryRow(today, names[19]!)).toBeVisible()

    await page.getByRole('button', { name: 'Select', exact: true }).click()

    // Select the bottom-most (oldest) row, below the fold on a 390×844 screen.
    const lastRow = entryRow(today, names[0]!)
    await lastRow.scrollIntoViewIfNeeded()
    await lastRow.getByRole('checkbox', { name: 'Select entry' }).click()

    // The bar must actually be reachable: fully inside the viewport, above
    // the fixed dock — not scrolled off the top (a bottom-sticky element
    // rendered above the list can only move up, never back into view).
    const bar = page.getByRole('region', { name: 'Bulk actions' })
    await expect(bar).toBeVisible()
    const barBox = await bar.boundingBox()
    expect(barBox).not.toBeNull()
    expect(barBox!.y).toBeGreaterThanOrEqual(0)
    expect(barBox!.y + barBox!.height).toBeLessThanOrEqual(VIEWPORT.height)

    // No page-wide horizontal scroll (WCAG 1.4.10 Reflow), and every bar
    // action — Delete included — sits fully inside the 390px viewport.
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(scrollWidth).toBeLessThanOrEqual(VIEWPORT.width)
    const deleteBox = await bar.getByRole('button', { name: 'Delete' }).boundingBox()
    expect(deleteBox).not.toBeNull()
    expect(deleteBox!.x).toBeGreaterThanOrEqual(0)
    expect(deleteBox!.x + deleteBox!.width).toBeLessThanOrEqual(VIEWPORT.width)
  })
})
