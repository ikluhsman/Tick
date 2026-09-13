# Tests

## Running

```bash
npm test          # vitest run — the whole unit suite, once
npm run test:watch
npm test -- test/unit/parse.spec.ts        # one file
npm test -- -t "parseDuration"             # one describe/it by name
npm run test:e2e  # Playwright (separate runner, see test/e2e)
```

`npm test` never touches the dev server on :3790 or the dev database.

## Layout

| Path | What lives there |
| --- | --- |
| `test/unit/*.spec.ts` | Pure-function and module-level units. No Nuxt runtime, no network, no DB. |
| `test/e2e/**` | Playwright specs. Excluded from Vitest in `vitest.config.ts`. |

`test/e2e/a11y.spec.ts` sweeps every main page (plus the picker and
manual-entry dialogs) with `@axe-core/playwright`, in both shipped
color-mode defaults — see the "Accessibility" section of `test/e2e/README.md`
for what it covers and how to read a failing run (each violation prints its
axe rule id, impact, help text and the failing selector).

Current unit files:

- `test/unit/parse.spec.ts` — `app/utils/parse.ts`: `parseDate`, `parseTime`, `parseDuration`, `parseEstimate`. Every date/time/duration format listed in `docs/content/3.guide/1.timer-and-entries.md` has a case, plus the invalid-input cases that must return `null`.
- `test/unit/format.spec.ts` — `app/utils/format.ts`: `formatDuration`, `formatClock`, `formatMoney`, `formatTime`, `formatRange`, `formatDayLabel`, `formatDaySub`, `formatDateLong`, `formatEstimate`, `clientColorVar`, plus `formatDuration` ↔ `parseDuration` round-trips.

## Config

`vitest.config.ts` at the repo root: `environment: 'node'`, `globals: true`, `include: ['test/**/*.spec.ts']`.
A spec that needs a DOM opts in per file with a first-line docblock:

```ts
// @vitest-environment happy-dom
```

Nuxt auto-imports do **not** exist here. Import the thing you are testing by
relative path (`../../app/utils/parse`); the aliases `~`, `~~`, `@@` and
`#shared` are wired up in the config for modules that use them internally.

## Adding a case

1. Find the spec for the module (or add `test/unit/<module>.spec.ts`).
2. Table-driven cases go in an `it.each<[Input, Expected]>([...])` block next to
   their siblings; one behaviour per `it`, named after the behaviour, not the
   function.
3. **Determinism is non-negotiable.** No file may depend on the real date, the
   real timezone, or on another file having run first:
   - Anything relative to "now" takes an explicit reference date (`parseDate(input, REF)`)
     or fakes the clock: `vi.useFakeTimers(); vi.setSystemTime(REF)` with
     `vi.useRealTimers()` in `afterEach`.
   - Build date fixtures from local components — `new Date(2026, 2, 14, 9, 5)` —
     never from an ISO string with a `Z`, which shifts by timezone.
   - Compare dates by local Y/M/D (see the `ymd()` helper), not `toISOString()`.
   - The suite is verified under UTC, America/Denver, Europe/Berlin,
     Australia/Sydney, Asia/Kolkata, Pacific/Chatham and America/Sao_Paulo:
     `TZ=Pacific/Chatham npm test`.
4. Never soften an assertion to make it pass. If the code is wrong, that is a
   bug — file it or fix the code.
