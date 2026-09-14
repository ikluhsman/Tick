// Simulates the actual #6 failure (a Secure cookie issued to a non-secure
// origin) on loopback, since CI has no LAN IP: --host-resolver-rules maps a
// non-localhost hostname onto 127.0.0.1. Chromium's secure-context check is
// textual (only "localhost" and loopback IP literals are trustworthy), so
// http://tick.test is treated as plain HTTP even though it resolves locally.
//
// The e2e server always runs with NUXT_SESSION_COOKIE_SECURE=false (serve.mjs),
// so these cases can't reproduce a Secure cookie failing on plain HTTP
// directly — see README's "Not possible in CI" note. What they prove instead:
// the override lets a real plain-HTTP login work end to end, and the
// detection message (app/utils/sessionCookieProblem.ts) picks the right
// branch when a stubbed 2xx response mimics the "no user" outcome, without
// needing a browser that actually dropped a cookie.
import { chromium, type Browser, type Page } from '@playwright/test'
import { expect, test } from './helpers/test'
import { waitForHydration } from './helpers/hydration'
import { SEED_USER } from './helpers/fixtures'

const PORT = Number(process.env.E2E_PORT ?? 3804)
const executablePath = process.env.E2E_CHROMIUM
  ?? '/home/crash/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell'

/** Manually-created pages aren't wrapped by helpers/test's page fixture. */
async function goto(page: Page, url: string) {
  const response = await page.goto(url)
  await waitForHydration(page)
  return response
}

async function fillLoginForm(page: Page, password: string) {
  await page.locator('input[name="email"]').fill(SEED_USER.email)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

/** A 2xx login response that never sets a real cookie — mimics the browser
 * having refused/dropped it, whatever the reason. */
function stubAcceptedLogin(page: Page) {
  return page.route('**/api/auth/login', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  )
}

test.describe('plain-HTTP origin (tick.test mapped to 127.0.0.1)', () => {
  let browser: Browser

  test.beforeAll(async () => {
    browser = await chromium.launch({
      executablePath,
      args: ['--host-resolver-rules=MAP tick.test 127.0.0.1']
    })
  })

  test.afterAll(async () => {
    await browser.close()
  })

  test('login works with the Secure override on, and survives reload/logout', async () => {
    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      await goto(page, `http://tick.test:${PORT}/login`)
      const secureContext = await page.evaluate(() => window.isSecureContext)
      expect(secureContext, 'tick.test:PORT must be a non-secure context for this simulation to be valid').toBe(false)

      await fillLoginForm(page, SEED_USER.password)
      await page.waitForURL('**/')
      await expect(page.getByRole('heading', { level: 1, name: /, Mara$/ })).toBeVisible()

      await page.reload()
      await waitForHydration(page)
      await expect(page.getByRole('heading', { level: 1, name: /, Mara$/ })).toBeVisible()

      await page.getByRole('button', { name: new RegExp(SEED_USER.name) }).click()
      await page.getByRole('menuitem', { name: 'Log out' }).click()
      await page.waitForURL('**/login')
    } finally {
      await context.close()
    }
  })

  test('shows the plain-HTTP detection message when the session never carries a user', async () => {
    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      await stubAcceptedLogin(page)
      await goto(page, `http://tick.test:${PORT}/login`)
      await fillLoginForm(page, SEED_USER.password)
      await expect(page.getByText(/plain HTTP \(tick\.test:/)).toBeVisible()
      expect(new URL(page.url()).pathname).toBe('/login')
    } finally {
      await context.close()
    }
  })
})

test.describe('generic detection branch (127.0.0.1, a secure context)', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('shows the cookie-blocking message when the session never carries a user', async ({ page }) => {
    await stubAcceptedLogin(page)
    await page.goto('/login')
    await fillLoginForm(page, SEED_USER.password)
    await expect(page.getByText(/Allow cookies for this site/)).toBeVisible()
    expect(new URL(page.url()).pathname).toBe('/login')
  })
})
