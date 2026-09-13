import { defineConfig } from '@playwright/test'

// Playwright config for the Tick end-to-end suite (`npm run test:e2e`).
//
// The suite never touches the dev server on 3790 or its database: it builds the
// app into test/e2e/.cache (isolated buildDir, so the shared .nuxt is left
// alone) and serves it on 3804 against the dedicated tick_test database.
// See test/e2e/README.md.

const PORT = Number(process.env.E2E_PORT ?? 3804)
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`

/** Chromium headless shell installed for this machine. */
const executablePath = process.env.E2E_CHROMIUM
  ?? '/home/crash/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell'

/** Session for the seeded user, written by global-setup. */
export const STORAGE_STATE = 'test/e2e/.cache/storage-state.json'

export default defineConfig({
  testDir: './test/e2e',
  globalSetup: './test/e2e/global-setup.ts',
  outputDir: 'test/e2e/.cache/results',
  // One worker, files in order: every spec drives the same seeded account, and
  // a timer is one-per-user server-side — parallel files would fight over it.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    storageState: STORAGE_STATE,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath }
  },
  projects: [
    {
      name: 'desktop',
      grepInvert: /@mobile/,
      use: {
        browserName: 'chromium',
        viewport: { width: 1440, height: 900 },
        launchOptions: { executablePath }
      }
    },
    {
      // Runs only the specs tagged @mobile.
      name: 'mobile',
      grep: /@mobile/,
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        launchOptions: { executablePath }
      }
    }
  ],
  webServer: {
    command: 'node test/e2e/serve.mjs',
    url: baseURL,
    // First run builds the app (~30s); later runs reuse the bundle unless a
    // source file is newer.
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    // The build is chatty; keep the reporter readable and let failures speak
    // through stderr. E2E_SERVER_LOG=1 brings the build/server log back.
    stdout: process.env.E2E_SERVER_LOG ? 'pipe' : 'ignore',
    stderr: 'pipe',
    env: {
      E2E_PORT: String(PORT),
      PORT: String(PORT)
    }
  }
})
