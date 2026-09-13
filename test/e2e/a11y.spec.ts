// Automated accessibility sweep (axe-core) — the regression guard for the
// swing-6 accessibility audit (issue #15). Desktop project runs every test
// here; a small subset tagged `@mobile` also runs at 390×844.
//
// Covers: logged-out auth pages, every main page logged in (in both shipped
// color-mode defaults — Nocturne/dark and Daylight/light), and the two
// dialogs that don't show up in a plain page load (picker, manual entry).
// See test/e2e/README.md for how to read a failing run.
import AxeBuilder from '@axe-core/playwright'
import type { AxeResults } from 'axe-core'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { STORAGE_STATE } from '../../playwright.config'
import { picker, timerPlus } from './helpers/dom'

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

function formatViolations(violations: AxeResults['violations']): string {
  return violations
    .map(v =>
      `${v.id} (${v.impact}) — ${v.help}\n`
      + v.nodes.map(n => `    target: ${n.target.join(' ')}`).join('\n')
    )
    .join('\n\n')
}

/** Runs axe over the whole document and asserts zero violations. No blanket
 * rule disables — a genuine third-party-only violation gets a `.exclude()`
 * with a comment, not a disabled rule. */
async function checkA11y(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  expect(violations, violations.length ? `axe violations on ${label}:\n\n${formatViolations(violations)}` : '').toEqual([])
}

/** Settings → Appearance preset buttons apply AND persist immediately (cookie
 * + localStorage + `PATCH /api/me/theme`) — the same mechanism theme.spec.ts
 * exercises, so this is the "real" way to switch theme, not a hand-rolled
 * cookie. Every test below starts from a fresh context (Playwright's default
 * `page` fixture reloads `storageState` per test), so the preset has to be
 * (re)applied at the top of each one — it does not carry over between tests. */
async function applyPreset(page: Page, name: 'Nocturne' | 'Daylight') {
  await page.goto('/settings')
  const btn = page.getByRole('button', { name: `Apply ${name} preset` })
  await btn.click()
  await expect(btn).toHaveAttribute('aria-pressed', 'true')
}

const PAGES = ['/', '/time', '/calendar', '/reports', '/projects', '/clients', '/tags', '/settings']

test.describe('logged out', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('/login has no violations', async ({ page }) => {
    await page.goto('/login')
    await checkA11y(page, '/login')
  })

  test('/register has no violations', async ({ page }) => {
    await page.goto('/register')
    await checkA11y(page, '/register')
  })
})

for (const preset of ['Nocturne', 'Daylight'] as const) {
  test.describe(`logged in — ${preset}`, () => {
    for (const path of PAGES) {
      test(`${path} has no violations (${preset})`, async ({ page }) => {
        await applyPreset(page, preset)
        await page.goto(path)
        await checkA11y(page, `${path} (${preset})`)
      })
    }
  })
}

test.describe('open dialogs (desktop)', () => {
  test('picker dialog has no violations', async ({ page }) => {
    await page.goto('/time')
    await timerPlus(page).click()
    await page.getByRole('menuitem', { name: 'Project' }).click()
    await expect(picker(page)).toBeVisible()
    // Type so a result is highlighted (aria-activedescendant populated) —
    // the state most likely to trip up the combobox/listbox wiring.
    await picker(page).getByRole('combobox').fill('a')
    await checkA11y(page, 'picker dialog')
  })

  test('manual entry dialog has no violations', async ({ page }) => {
    await page.goto('/time')
    await page.getByRole('button', { name: 'Manual entry' }).click()
    const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Manual entry' }) })
    await expect(dialog).toBeVisible()
    await checkA11y(page, 'manual entry dialog')
  })
})

test.describe('mobile subset', { tag: '@mobile' }, () => {
  test('/ has no violations', async ({ page }) => {
    await page.goto('/')
    await checkA11y(page, '/ (mobile)')
  })

  test('/time has no violations, incl. Select mode on', async ({ page }) => {
    await page.goto('/time')
    await checkA11y(page, '/time (mobile)')

    await page.getByRole('button', { name: 'Select' }).click()
    await expect(page.getByRole('button', { name: 'Done' })).toHaveAttribute('aria-pressed', 'true')
    await checkA11y(page, '/time (mobile, Select mode on)')
  })

  test('/clients has no violations', async ({ page }) => {
    await page.goto('/clients')
    await checkA11y(page, '/clients (mobile)')
  })

  test('picker bottom sheet has no violations', async ({ page }) => {
    await page.goto('/time')
    await timerPlus(page).click()
    await expect(picker(page)).toBeVisible()
    await checkA11y(page, 'picker bottom sheet (mobile)')
  })
})

// Leaves the account on the default theme once this file's tests are done —
// `users.theme` is persisted server-side and reseeding does not reset it, so
// without this the *next* `npm run test:e2e` invocation's one-time login
// would bake Daylight into the shared storageState.json and start every
// other spec file's tests in light mode.
test.afterAll(async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: STORAGE_STATE })
  const page = await ctx.newPage()
  await applyPreset(page, 'Nocturne')
  await ctx.close()
})
