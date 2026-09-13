// Timer bar: describe → start → clock ticks → attach a project through the
// picker → stop → the entry is at the top of Today on /time with its chain
// and resolved rate.
import { expect, test } from './helpers/test'
import type { DeleteResult } from '../../shared/types'
import {
  clearRunningTimer,
  deleteEntriesNamed,
  deleteEntry,
  listEntries,
  restoreDeleted,
  todayRange
} from './helpers/api'
import { group, picker, rows, entryRow, timerChain, timerClock, timerInput, timerPlus, timerToggle } from './helpers/dom'
import { SEED, SEED_USER, startsWith, uniqueName } from './helpers/fixtures'

const NAME = uniqueName('E2E timer run')

/** Seeded rows parked in the trash for the duration of the test. */
const parked: DeleteResult[] = []

test.beforeEach(async ({ api }) => {
  await clearRunningTimer(api)
  // The seed writes today's three entries at fixed clock times (9:05, 11:30,
  // 13:00). Whether a timer stopped "now" sorts above them therefore depends
  // on the hour of the run — so park them in the trash and restore them after,
  // which makes "at the top of Today" a claim about the app, not the clock.
  for (const e of await listEntries(api, todayRange())) {
    const result = await deleteEntry(api, e.id)
    if (result) parked.push(result)
  }
})

test.afterEach(async ({ api }) => {
  await clearRunningTimer(api)
  await deleteEntriesNamed(api, NAME)
  while (parked.length) await restoreDeleted(api, parked.pop()!)
})

test('starts, ticks, attaches a project, stops into the top of Today', async ({ page }) => {
  await page.goto('/time')

  // ── Describe + start ─────────────────────────────────────────────────────
  await timerInput(page).fill(NAME)
  await expect(timerToggle(page)).toHaveAccessibleName('Start')
  await timerToggle(page).click()
  await expect(timerToggle(page)).toHaveAccessibleName('Stop')

  // ── The clock ticks (polled, never a fixed sleep) ─────────────────────────
  await expect(timerClock(page)).toHaveText(/^00:00:0[2-9]$/, { timeout: 15_000 })

  // ── Attach a project through the picker ──────────────────────────────────
  await timerPlus(page).click()
  await page.getByRole('menuitem', { name: 'Project' }).click()
  await expect(picker(page)).toBeVisible()
  await picker(page).getByRole('combobox').fill(SEED.projectNoRate.name)
  await picker(page).getByRole('option', { name: startsWith(SEED.projectNoRate.name) }).click()
  await expect(picker(page)).toBeHidden()
  await expect(timerChain(page)).toHaveText(`${SEED.projectNoRate.name} · ${SEED.projectNoRate.client}`)

  // ── Stop ─────────────────────────────────────────────────────────────────
  await timerToggle(page).click()
  await page.waitForURL('**/time')
  await expect(timerToggle(page)).toHaveAccessibleName('Start')

  // ── The stopped entry tops the Today group, chain and rate intact ────────
  const today = group(page, 'Today')
  await expect(rows(today).first()).toContainText(NAME)
  const row = entryRow(today, NAME)
  await expect(row).toContainText(SEED.projectNoRate.name)
  await expect(row).toContainText(SEED.projectNoRate.client)
  // Rule 2: nothing overrides, so the rate resolves to the user default.
  await expect(
    row.getByRole('button', { name: `Billable at $${SEED_USER.defaultRate}/h` })
  ).toBeVisible()
})
