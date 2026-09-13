// Sign in / sign out / route guard — the flow every swing re-verified by hand.
// Opts out of the shared storageState: these tests drive the real form.
import { expect, test } from './helpers/test'
import { SEED_USER } from './helpers/fixtures'

test.use({ storageState: { cookies: [], origins: [] } })

async function signIn(page: import('@playwright/test').Page, password: string) {
  await page.goto('/login')
  await page.locator('input[name="email"]').fill(SEED_USER.email)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

test('signs the seeded user in and lands on the dashboard', async ({ page }) => {
  await signIn(page, SEED_USER.password)

  await page.waitForURL('**/')
  // Dashboard greeting, e.g. "Good afternoon, Mara"
  await expect(page.getByRole('heading', { level: 1, name: /, Mara$/ })).toBeVisible()
  // Sidebar footer proves the session carries the seeded identity.
  await expect(page.getByText(SEED_USER.name, { exact: true })).toBeVisible()
  await expect(page.getByText(SEED_USER.orgName, { exact: true }).first()).toBeVisible()
})

test('shows an error and stays put on a wrong password', async ({ page }) => {
  await signIn(page, 'definitely-not-the-password')

  await expect(page.getByText('Invalid email or password.')).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/login')
  // Still logged out: a protected route must bounce.
  await page.goto('/time')
  await page.waitForURL('**/login')
})

test('logging out returns to /login and drops the session', async ({ page }) => {
  await signIn(page, SEED_USER.password)
  await page.waitForURL('**/')

  await page.getByRole('button', { name: new RegExp(SEED_USER.name) }).click()
  await page.getByRole('menuitem', { name: 'Log out' }).click()

  await page.waitForURL('**/login')
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  await page.goto('/')
  await page.waitForURL('**/login')
})

test('a protected route redirects to /login when logged out', async ({ page }) => {
  await page.goto('/time')
  await page.waitForURL('**/login')
  await expect(page.getByText('Welcome back to Tick')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
})
