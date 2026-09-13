// Waits out the window where SSR markup is on the page but Vue hasn't
// attached its listeners to it yet — a `.click()` in that window lands on a
// real, visible, stable (by Playwright's actionability rules) DOM node that
// simply does nothing, because the click handler isn't wired up until
// hydration finishes. That's indistinguishable from a real bug until you
// `--repeat-each` a spec a few dozen times.
//
// `useNuxtApp()` / `window.useNuxtApp` are dev-only convenience globals and
// are gone in the production build this suite runs (test/e2e/build.mjs) — so
// this can't read `useNuxtApp().isHydrating` directly from the page. The one
// signal that does survive into prod is the flag Nuxt's own runtime reads
// for the same "is it safe to touch the DOM yet" question (e.g.
// `nuxtApp.isHydrating` gating <ClientOnly> and <NuxtPage> in
// node_modules/nuxt/dist/app/components/{client-only,nuxt-root}.*): every
// Vue app exposes its nuxtApp as `app.config.globalProperties.$nuxt`, and
// Vue itself stashes the mounted app instance on its container element as
// `<container>.__vue_app__` (runtime-core's `mount()`). Nuxt's root mount
// point is `#__nuxt` (default `app.rootId`, unchanged in nuxt.config.ts).
//
// Verified against this project's real e2e build with a throwaway probe
// script (playwright-core hitting the built app on :3814): polling this
// expression from just after `page.goto` returns gave
//   undefined → undefined → undefined → true → false
// and it stayed `false` on every later read — never flipping back, never
// `undefined` again. That's exactly the three states this function cares
// about: not mounted yet, mounted-but-hydrating (unsafe to click), done.
import type { Page } from '@playwright/test'

type HydrationRoot = Element & {
  __vue_app__?: {
    config?: {
      globalProperties?: {
        $nuxt?: { isHydrating?: boolean }
      }
    }
  }
}

/** Resolves once the app mounted at `#__nuxt` has finished hydrating. */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const root = document.querySelector('#__nuxt') as HydrationRoot | null
    return root?.__vue_app__?.config?.globalProperties?.$nuxt?.isHydrating === false
  })
}
