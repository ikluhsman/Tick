// Base test extended with an `api` fixture, and a `page` fixture that gives
// every page a never-decreasing Date.now() and never hands a spec control
// back until the app has hydrated.
//
// The e2e server runs with NUXT_SESSION_COOKIE_SECURE=false (set in serve.mjs)
// because Playwright's standalone APIRequestContext treats only "localhost" as
// a secure host and never sends a Secure cookie to http://127.0.0.1 (the
// browser context does). `page.request` shares the browser context's cookie
// jar either way, so setup/cleanup calls carry the same session the test is
// driving.
//
// Every spec imports `test`/`expect` from here, not from `@playwright/test`:
// this is the one place that wraps page.goto/page.reload. Those are the only
// navigations that start a new hydration cycle — an SPA route change is
// triggered by a click, which already needed a hydrated listener.
//
// Date.now(): the wall clock on some hosts (WSL2 in particular) steps
// backwards by seconds at a time. Vue stamps each listener with Date.now()
// when it attaches; the first Vue listener an event reaches records the
// event's Date.now(), and any later listener whose stamp is >= that value
// skips the event. So after a backwards step, a click on a freshly attached
// listener (e.g. a row button under EntryRow's @click.capture) is silently
// dropped. Clamping to the last value is not enough — a frozen clock still
// equals the stamp — so Date.now() is derived from performance.now().
// `new Date()` stays on the real clock, so on such a host Date.now() runs
// ahead of it by every backwards step since the page loaded: assert on
// elapsed-time displays (the timer clock) soon after navigation, not after a
// page has been open for minutes.
import { test as base, type APIRequestContext } from '@playwright/test'
import { waitForHydration } from './hydration'

export const test = base.extend<{ api: APIRequestContext }>({
  api: async ({ page }, use) => {
    await use(page.request)
  },
  page: async ({ page }, use) => {
    // Init scripts re-run before the page's own code on every navigation.
    await page.addInitScript(() => {
      const origin = Date.now() - performance.now()
      Date.now = () => Math.floor(origin + performance.now())
    })

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
