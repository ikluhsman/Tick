// Waits until Vue has hydrated the SSR markup. Before that, a click lands on
// a real, visible node that Playwright considers actionable but that has no
// listener yet, so it silently does nothing.
//
// The signal is Nuxt's own `nuxtApp.isHydrating`, reached through the mounted
// app Vue stores on its container (`#__nuxt.__vue_app__`) and the `$nuxt`
// global property Nuxt defines on it — no dependence on `useNuxtApp` being
// exposed on window.
import { errors, type Page } from '@playwright/test'

type HydrationRoot = Element & {
  __vue_app__?: {
    config?: {
      globalProperties?: {
        $nuxt?: { isHydrating?: boolean }
      }
    }
  }
}

/** Resolves once the app mounted at `#__nuxt` has finished hydrating.
 * Bounded well under the 60s test timeout so a broken signal fails with a
 * specific message rather than a generic test timeout. */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const root = document.querySelector('#__nuxt') as HydrationRoot | null
    return root?.__vue_app__?.config?.globalProperties?.$nuxt?.isHydrating === false
  }, undefined, { timeout: 15_000 }).catch((err: unknown) => {
    if (err instanceof errors.TimeoutError) {
      throw new Error('waitForHydration: #__nuxt app never reported isHydrating === false within 15s')
    }
    throw err
  })
}
