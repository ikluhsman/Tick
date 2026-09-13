# Contributing to Tick

Thanks for taking the time. Tick is a small, self-hosted time tracker — Nuxt 4
(app + Nitro API), Pinia, Drizzle ORM on Postgres, nuxt-auth-utils for sessions.
This file covers everything you need to get it running, test it, and land a
change.

---

## 1. Getting it running

**Requirements:** Node **22+** (the Docker image is `node:22-alpine`), npm, and
a reachable PostgreSQL **17**.

```sh
git clone https://github.com/ticktimer/Tick.git
cd Tick
npm i

cp .env.example .env
# Required in .env:
#   NUXT_DATABASE_URL      postgresql://tick:password@localhost:5432/tick
#   NUXT_SESSION_PASSWORD  32+ random chars — openssl rand -base64 36

npm run db:push     # create the schema (development uses push, not migrations)
npm run db:seed     # demo org + ~3 weeks of entries
npm run dev
```

The dev server comes up on <http://localhost:3000>. Sign in with the seeded
account: **mara@example.com** / **tick-demo** (org "Hollow Studio").

Every knob is documented in [`.env.example`](.env.example) and in
[docs/content/4.reference/3.env.md](docs/content/4.reference/3.env.md).

### No Postgres handy?

```sh
docker run -d --name tick-db -p 5432:5432 \
  -e POSTGRES_USER=tick -e POSTGRES_PASSWORD=tick_dev_password \
  -e POSTGRES_DB=tick postgres:17
```

### Database workflow

| Situation | Command |
| --- | --- |
| You changed `server/db/schema.ts` and want it in your dev database | `npm run db:push` |
| You changed the schema and are **shipping** it | `npm run db:generate`, then commit the new file under `server/db/migrations/` |
| You want the demo data back | `npm run db:seed` |

Deployed instances replay the committed SQL migrations on startup
(`NUXT_AUTO_MIGRATE`, default `true`), so a schema change that never got a
generated migration will not reach anyone's server. Generate it.

---

## 2. Tests

Tick has four suites. Two of them need a **dedicated test database** called
`tick_test` — never your dev database, and the suites enforce it
(`test/unit/cascade.spec.ts` refuses any URL not ending in `/tick_test`).

```sh
# one-time: create the test database and give it the schema + demo seed
createdb tick_test   # or: docker exec tick-db createdb -U tick tick_test
NUXT_DATABASE_URL='postgresql://tick:tick_dev_password@localhost:5432/tick_test' npm run db:push -- --force
NUXT_DATABASE_URL='postgresql://tick:tick_dev_password@localhost:5432/tick_test' npm run db:seed
```

The suites hard-code
`postgresql://tick:tick_dev_password@localhost:5432/tick_test`
(`test/helpers/server.ts`, `test/e2e/helpers/fixtures.ts`), so a local Postgres
with the `tick` / `tick_dev_password` credentials is the path of least
resistance. `E2E_DATABASE_URL` and `TEST_DATABASE_URL` override it for the e2e
and cascade suites respectively.

| Suite | Command | Needs a DB? | Notes |
| --- | --- | --- | --- |
| Types | `npm run typecheck` | no | `nuxt typecheck` (vue-tsc). There is no linter in this repo. |
| Unit | `npm test` | yes (schema only) | Vitest, `test/**/*.spec.ts`. Mostly pure; `cascade.spec.ts` drives real transactions. |
| Integration | `npx vitest run --config vitest.integration.config.ts` | yes (schema + seed) | Builds the app and boots Nitro on 3801–3803, drives it over HTTP. First run is slow — it builds. |
| E2E | `npm run test:e2e` | yes (schema + seed) | Playwright against a production build served on 3804. |

Useful variants:

```sh
npm test -- test/unit/parse.spec.ts    # one unit file
npm test -- -t "parseDuration"         # one test by name
npm run test:watch                     # vitest watch
npm run test:e2e -- timer.spec.ts      # one e2e file
npm run test:e2e -- --project=mobile   # the 390×844 project only
```

More detail: [`test/README.md`](test/README.md) (unit layout + determinism
rules) and [`test/e2e/README.md`](test/e2e/README.md) (how a Playwright run is
wired, selector conventions).

### Rules for tests you write

- **Deterministic or it doesn't land.** No dependence on the real clock, the
  real timezone, or on another file having run first. Anything relative to
  "now" takes an explicit reference date or fakes the clock. The unit suite is
  verified under UTC, America/Denver, Europe/Berlin, Australia/Sydney,
  Asia/Kolkata, Pacific/Chatham and America/Sao_Paulo (`TZ=… npm test`).
- **Clean up what you create.** The integration suite registers its own
  org + user per file; the e2e specs delete their rows in `afterEach` and stop
  any timer they started.
- **Never soften an assertion to make it pass.** If the code is wrong, that is
  a bug — fix the code or file it.

---

## 3. What CI enforces

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every pull
request and every push to `main` (and on `v*` tags). Four jobs, all required:

1. **Typecheck** — `npm run typecheck`
2. **Unit tests** — `npm test`, against a `postgres:17` service container
3. **Integration tests** — `npx vitest run --config vitest.integration.config.ts`
4. **E2E tests** — `npm run test:e2e`, Chromium installed via
   `playwright install`, the app built once up front

Only if all four pass does the **publish** job call
[`.github/workflows/docker.yml`](.github/workflows/docker.yml) to build and push
the image to GHCR (`latest` + `sha-…` on `main`, semver on `v*` tags). That
workflow has no trigger of its own any more, so an untested image cannot be
published.

CI uses Node 22 with the npm cache, and a new push to a branch cancels the run
it supersedes.

You can't run GitHub Actions locally, but you can run exactly what it runs —
the four commands above are the whole gate.

---

## 4. Commits and pull requests

**Commits** follow [Conventional Commits](https://www.conventionalcommits.org):

```
feat(timer): keep the running entry when the tab sleeps
fix(reports): round billable totals to cents, not dollars
docs(installation): note that the GHCR package is public
chore(deps): bump drizzle-orm to 0.45.3
```

Common types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `chore`, `ci`.
Imperative mood, lower case, no trailing period. Keep the subject under ~72
characters and put the *why* in the body.

**Pull requests:**

- Branch off `main`; one concern per PR.
- Fill in [the PR template](.github/pull_request_template.md) — what changed,
  why, how you verified it.
- Green CI is required. If a change touches behaviour, it comes with a test.
- Update the docs in the same PR when you change behaviour, an endpoint, or an
  environment variable.
- Screenshots (before/after) for anything visual.

**House rules** the reviewer will look for:

- `<script setup lang="ts">` for every Vue component.
- Nuxt UI components where they fit, and colours only through semantic tokens
  (`primary`, `neutral`, `--ui-*`). No hard-coded hex.
- Tabular numerals (`.tnum`) on every time and money figure.
- Shared DTO types live in `shared/types/index.ts` — don't redefine them.
- Everything soft-deletes (`deleted_at`, 30-day trash). Deletes cascade
  downward only, and every destructive action returns a restorable snapshot.

---

## 5. Where the docs live

- **`docs/`** — the documentation site (its own Nuxt app, `@nuxt/content`).
  Prose lives in **`docs/content/`**:

  | Path | Covers |
  | --- | --- |
  | `1.getting-started.md` | first run |
  | `2.installation.md` | Docker Compose, `docker run`, native + PM2, reverse proxy |
  | `3.guide/` | timer & entries, reports, imports/exports, theme editor |
  | `4.reference/` | data model, API surface, environment variables, security |

  Run it locally with `cd docs && npm i && npm run dev`.

- **`README.md`** — the short version: install paths, env vars, development.
- **`test/README.md`**, **`test/e2e/README.md`** — the test suites.

If you change an endpoint, a default, or a user-visible behaviour, the matching
page under `docs/content/` changes in the same commit.

---

## 6. Reporting bugs

Open an issue with the version (or image tag / commit sha), how Tick is
deployed, what you did, what you expected, and what happened. Server logs
(`docker compose logs app`) help. For anything security-sensitive, please
report privately rather than in a public issue.
