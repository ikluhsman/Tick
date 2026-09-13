// /calendar week grid: seeded blocks render, clicking a block edits it (and
// must NOT start tracking), the block's play button is the only thing that does.
import { expect, test } from './helpers/test'
import { clearRunningTimer, createEntry, deleteEntriesNamed } from './helpers/api'
import { timerInput, timerToggle } from './helpers/dom'
import { SEED, startsWith, uniqueName } from './helpers/fixtures'

/** Our own block: 3–5pm today, clear of the seeded 9:05/11:30/13:00 blocks. */
const BLOCK = uniqueName('E2E block')

function todaySlot(fromHour: number, toHour: number) {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), fromHour, 0)
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), toHour, 0)
  return { start: start.toISOString(), end: end.toISOString() }
}

/** A calendar block, addressed by the entry name it opens with. */
function block(page: import('@playwright/test').Page, name: string) {
  return page.getByRole('button', { name: startsWith(name) }).first()
}

test.beforeEach(async ({ api }) => {
  await clearRunningTimer(api)
  await deleteEntriesNamed(api, BLOCK)
  await createEntry(api, { name: BLOCK, billable: true, ...todaySlot(15, 17) })
})

test.afterEach(async ({ api }) => {
  await clearRunningTimer(api)
  await deleteEntriesNamed(api, BLOCK)
})

test('the week grid renders the seeded blocks', async ({ page }) => {
  await page.goto('/calendar')
  await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible()

  // Today's three seeded entries always exist (server/utils/demo.ts).
  for (const name of SEED.todayEntries) {
    await expect(block(page, name)).toBeVisible()
  }
  await expect(block(page, BLOCK)).toBeVisible()
  // The block carries its own range + duration, so it is placed on the grid,
  // not just listed.
  await expect(block(page, BLOCK)).toHaveAttribute('title', `${BLOCK} · 3:00pm – 5:00pm · 2h 00m`)
})

test('clicking a block opens the edit dialog without starting the timer', async ({ page, api }) => {
  await page.goto('/calendar')
  const target = block(page, BLOCK)
  await expect(target).toBeVisible()

  // Left edge, vertical middle — clear of the play button on the right.
  await target.click({ position: { x: 10, y: 30 } })

  const dialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'Edit entry' })
  })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('What did you work on?')).toHaveValue(BLOCK)

  // The regression this guards: a bare block surface must never start
  // tracking. The server is the authority — no running entry exists.
  const timer = await api.get('/api/timer')
  expect(await timer.text()).toBe('')

  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  // …and the timer bar behind the dialog is still idle.
  await expect(timerToggle(page)).toHaveAccessibleName('Start')
})

test('the block play button starts the timer for that entry', async ({ page, api }) => {
  await page.goto('/calendar')
  await expect(block(page, BLOCK)).toBeVisible()

  await page.getByRole('button', { name: `Start timer for ${BLOCK}` }).click()

  await expect(timerToggle(page)).toHaveAccessibleName('Stop')
  await expect(timerInput(page)).toHaveValue(BLOCK)
  // No edit dialog opened alongside it.
  await expect(page.getByRole('heading', { name: 'Edit entry' })).toHaveCount(0)

  const timer = await api.get('/api/timer')
  expect(timer.ok()).toBe(true)
  expect(((await timer.json()) as { name: string }).name).toBe(BLOCK)
})
