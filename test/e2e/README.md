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

## Accessibility (`a11y.spec.ts`)

`@axe-core/playwright` scans every main page (logged out: `/login`, `/register`;
logged in: dashboard, Time, Calendar, Reports, Projects, Clients, Tags,
Settings) plus the picker and manual-entry dialogs, asserting zero
`wcag2a`/`wcag2aa`/`wcag21a`/`wcag21aa` violations. Logged-in pages run once
per shipped color-mode default — **Nocturne** (dark) and **Daylight**
(light) — switched via the real Settings → Appearance preset buttons (not a
hand-rolled cookie). Every test that switches to a non-default preset restores
Nocturne in its own `afterEach` (plus a belt-and-suspenders file-level
`afterAll`): the preset persists server-side (`users.theme`), so leaving it
dirty would carry into whichever spec — in this run or the *next* run's
one-time login — happens to go next. A small `@mobile`-tagged subset (`/`,
`/time` incl. Select mode on, `/clients`, the picker bottom sheet) also runs
in the `mobile` project.

**Reading a failure**: the assertion message lists every violation with its
axe rule id, impact (`minor`/`moderate`/`serious`/`critical`), the rule's
`help` text, and each failing node's target CSS selector — enough to find the
element without re-running anything. There are no disabled rules; a violation
that turns out to live inside a Nuxt UI internal you can't fix would get a
`.exclude()` on that exact selector with a comment explaining why (none exist
as of this writing — check `a11y.spec.ts` itself for the current list).

### Client avatar swatch ink (`client-color-contrast.spec.ts`)

The /clients avatar initials paint their ink with a CSS-only relative-color
computation (`.tick-on-swatch`, app/assets/css/main.css) instead of a JS
function, because the right ink depends on whichever primary (17 choices) and
neutral (9 choices) the user picked — not just the two shipped presets — and
CSS can't be unit-tested. This spec drives every primary and every neutral
through the real Settings → Appearance editor, in both color modes, and
asserts ≥4.5:1 via `getComputedStyle` on a live probe element (not a full axe
run — much faster, and deterministic in a way reading real seeded-client
avatars wouldn't be, since seeded client ids are DB-generated per seed run).
Restores the default theme in its own `afterEach` for the same reason as the
a11y spec above.

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
