// Base test extended with an `api` fixture.
//
// The session cookie is Secure (h3's default in a production build). A browser
// accepts that over http://127.0.0.1 because localhost is a trustworthy origin,
// but Playwright's standalone APIRequestContext does not send it — so the
// built-in `request` fixture would run unauthenticated. `page.request` shares
// the browser context's cookie jar, so setup/cleanup calls carry the same
// session the test is driving.
import { test as base, type APIRequestContext } from '@playwright/test'

export const test = base.extend<{ api: APIRequestContext }>({
  api: async ({ page }, use) => {
    await use(page.request)
  }
})

export { expect } from '@playwright/test'
