# End-to-end tests

Playwright drives a **real production build** of Tick against the dedicated
`tick_test` database. These specs cover the flows that were re-verified by hand
every swing: sign in / out, the timer, the Time page's entry flows, the calendar
grid, theme persistence, and the mobile shell.

```bash
npm run test:e2e                      # everything (desktop + mobile projects)
npm run test:e2e -- timer.spec.ts     # one file
npm run test:e2e -- --project=mobile  # the 390×844 project only
npx playwright test --ui              # interactive (needs a headed browser)
```

## What it does *not* touch

* The **dev server on 3790** and the **`tick` dev database** are never used and
  never written to.
* `nuxt build` clears and locks the shared `.nuxt` build directory, which would
  break that running dev server. So `test/e2e/build.mjs` drives `@nuxt/kit`
  directly with an isolated `buildDir` and Nitro output dir under
  `test/e2e/.cache/` (gitignored).

## How a run is wired

| Step | Where |
| --- | --- |
| Build the app (only when a source file is newer than the bundle) | `test/e2e/build.mjs` |
| Serve it on **3804** against `tick_test` | `test/e2e/serve.mjs` (Playwright `webServer`) |
| `db:push --force` + `db:seed` into `tick_test`, then log in once and save the session | `test/e2e/global-setup.ts` |
| Specs | `test/e2e/*.spec.ts` |

`E2E_FORCE_BUILD=1` forces a rebuild, `E2E_SERVER_LOG=1` shows the build/server
output, `E2E_PORT` / `E2E_BASE_URL` / `E2E_CHROMIUM` / `E2E_DATABASE_URL`
override the defaults.

Chromium is the headless shell already installed on this machine; the path is
set in `playwright.config.ts` (`launchOptions.executablePath`).

### Environment tweaks the e2e build makes

Both are test-environment concessions, and nothing under test asserts on them:

* `NUXT_AUTH_RATE_LIMIT=0` — the auth endpoints allow 10 POSTs per IP per
  minute; a suite that signs in repeatedly would trip the limiter.
* `NUXT_AUTO_MIGRATE=false` — `tick_test` is managed with `db:push`, so it
  carries no Drizzle migration journal and replaying `0000` would fail on
  existing tables.
* `runtimeConfig.session.cookie.secure = false` (baked into the e2e bundle
  only) — the suite talks plain http to 127.0.0.1 and Playwright's
  `APIRequestContext` will not send a `Secure` cookie over http, so the
  API-driven setup/cleanup helpers would run unauthenticated.
* The PWA service worker is disabled for this build. An auto-updating worker
  re-registering in every fresh browser context is pure flake and no flow under
  test involves it.

## Determinism rules the specs follow

* **One worker, files in order** (`fullyParallel: false`, `workers: 1`). Every
  spec drives the same seeded account and a timer is one-per-user server-side,
  so parallel files would fight over it.
* **The seed is the fixture.** `global-setup` reseeds `tick_test` before every
  run, so a run never inherits the previous one's state.
* **Everything a spec creates, it deletes** through the API in `afterEach`
  (`helpers/api.ts`). Specs that start a timer also stop it there — a leaked
  running timer would make the next `POST /api/timer/start` 409.
* **No wall-clock assumptions.** Ticking clocks are asserted with polled
  matchers, never `waitForTimeout`. `timer.spec` parks today's three seeded
  rows in the trash for the duration of the test and restores them afterwards:
  the seed writes them at fixed clock times (9:05, 11:30, 13:00), so whether a
  timer stopped "now" sorts above them would otherwise depend on the hour of
  the run.
* **Unique names.** Every row a spec creates carries a per-run suffix
  (`helpers/fixtures.ts`), so a row leaked by a crashed run can never be
  mistaken for a fresh one.

## Projects

| Project | Viewport | Runs |
| --- | --- | --- |
| `desktop` | 1440×900 | everything except `@mobile` |
| `mobile` | 390×844, `hasTouch` | only tests tagged `@mobile` (`mobile.spec.ts`) |

## Selector conventions

Roles, labels and headings first (`helpers/dom.ts`). Two notes:

* The shell renders the desktop timer bar **and** the mobile dock at the same
  time, one of them CSS-hidden — widgets that exist twice are narrowed with
  `filter({ visible: true })`, never with breakpoint classes.
* `div.group` is the one class-based hook: it is `TimeEntryRow`'s row grid and
  the only `group` class in the app.

## Shared-database caveat

Other suites on this machine also use `tick_test`. They work in their own orgs,
and `db:seed` only resets the "Hollow Studio" org and `mara@example.com`, so the
two coexist — but running another suite that reseeds *at the same time* as this
one will disturb it. A full run takes well under a minute.
