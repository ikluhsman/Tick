// Settings → Appearance: applying a preset persists across a reload, and the
// reloaded page hydrates clean.
//
// This is the regression guard for the SSR colour-mode fix: the saved theme
// rides a cookie so the server renders the right mode (and the right sidebar
// treatment) on the first byte. If it ever regresses, Vue logs "Hydration
// completed but contains mismatches." — which it does in production builds
// too — and this spec fails.
import { expect, test } from './helpers/test'

const HYDRATION_MISMATCH = /hydration (completed but contains mismatches|node mismatch|children mismatch|text mismatch)/i

/** Daylight — light · sky · zinc · radius 6 · DM Sans (app/utils/theme-presets.ts). */
const DAYLIGHT = {
  card: 'Apply Daylight preset',
  radius: '0.375rem',
  font: "'DM Sans', system-ui, sans-serif"
}
const NOCTURNE = { card: 'Apply Nocturne preset', radius: '0.25rem' }

function cssVar(page: import('@playwright/test').Page, name: string) {
  return page.evaluate(v => getComputedStyle(document.documentElement).getPropertyValue(v).trim(), name)
}

/** Resolves once Vue has mounted the app — hydration warnings are out by then. */
async function hydrated(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => {
    const root = document.querySelector('#__nuxt') as (HTMLElement & { __vue_app__?: unknown }) | null
    return !!root?.__vue_app__
  })
}

test.afterEach(async ({ page }) => {
  // Leave the account on the default theme so a re-run starts clean.
  await page.goto('/settings')
  await page.getByRole('button', { name: NOCTURNE.card }).click()
  await expect(page.getByRole('button', { name: NOCTURNE.card })).toHaveAttribute('aria-pressed', 'true')
})

test('a preset survives a reload and the reload hydrates without a mismatch', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (m) => {
    if (HYDRATION_MISMATCH.test(m.text())) consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => {
    if (HYDRATION_MISMATCH.test(String(e))) consoleErrors.push(String(e))
  })

  await page.goto('/settings')
  await hydrated(page)
  await expect(page.locator('html')).toHaveClass(/dark/)

  // ── Apply the preset: light mode, its own radius and font, applied live ──
  const daylight = page.getByRole('button', { name: DAYLIGHT.card })
  await daylight.click()
  await expect(daylight).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('html')).toHaveClass(/light/)
  expect(await cssVar(page, '--ui-radius')).toBe(DAYLIGHT.radius)
  expect(await cssVar(page, '--font-sans')).toBe(DAYLIGHT.font)

  // ── Reload: the server must render the saved theme on the first byte ─────
  await page.reload()
  await hydrated(page)

  await expect(page.locator('html')).toHaveClass(/light/)
  await expect(page.getByRole('button', { name: DAYLIGHT.card })).toHaveAttribute('aria-pressed', 'true')
  expect(await cssVar(page, '--ui-radius')).toBe(DAYLIGHT.radius)
  expect(await cssVar(page, '--font-sans')).toBe(DAYLIGHT.font)

  // A live interaction proves the page is really hydrated (and gives any
  // mismatch error time to have landed on the console).
  const ember = page.getByRole('button', { name: 'Apply Ember preset' })
  await ember.click()
  await expect(ember).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('html')).toHaveClass(/dark/)

  expect(consoleErrors, 'SSR/client hydration mismatch logged to the console').toEqual([])
})
