// Base test extended with an `api` fixture, and a `page` fixture that never
// hands a spec control back until the app has actually hydrated.
//
// The session cookie is Secure (h3's default in a production build). A browser
// accepts that over http://127.0.0.1 because localhost is a trustworthy origin,
// but Playwright's standalone APIRequestContext does not send it — so the
// built-in `request` fixture would run unauthenticated. `page.request` shares
// the browser context's cookie jar, so setup/cleanup calls carry the same
// session the test is driving.
//
// Every spec in this suite imports `test`/`expect` from here (not from
// `@playwright/test` directly) — this is the one place that wraps
// `page.goto`/`page.reload`. Both are full document loads, and a full
// document load is the only thing that starts a new hydration cycle: a
// click-triggered SPA route change (a NuxtLink, a `router.push` after
// stopping the timer, tab-bar navigation) happens entirely after the page
// has already hydrated, since the click that triggered it required a live
// Vue listener to fire in the first place. So wrapping just these two covers
// every navigation a spec can be sitting on when it fires its next action —
// no per-spec waits needed.
import { test as base, type APIRequestContext } from '@playwright/test'
import { waitForHydration } from './hydration'

export const test = base.extend<{ api: APIRequestContext }>({
  api: async ({ page }, use) => {
    await use(page.request)
  },
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page)
    page.goto = (async (url, options) => {
      const response = await goto(url, options)
      await waitForHydration(page)
      return response
    }) as typeof page.goto

    const reload = page.reload.bind(page)
    page.reload = (async (options) => {
      const response = await reload(options)
      await waitForHydration(page)
      return response
    }) as typeof page.reload

    await use(page)
  }
})

export { expect } from '@playwright/test'
