# Tick

Tick is a self-hosted, MIT-licensed time tracker for freelancers and small teams. It pairs a persistent one-click timer with a fast entries list, an open-ended client → project → task model, safe deletion everywhere (soft delete, cascade previews, 30-day trash, undo), server-resolved billable rates, and a built-in theme editor — all in a single small app you run with Docker or plain Node.

**Features**

- Sticky timer bar: start typing, attach a client/project/task later, one running timer per user
- Time page: entries grouped by day or project, `#tag` / `@name` / free-text filtering, bulk actions
- Manual entries with forgiving natural-language date, time and duration parsing ("yesterday", "9a–11.20", "1h30")
- Dashboard with hours, billable amounts and per-project breakdowns
- Clients, projects, tasks and tags with inline create from the picker
- Deletion that never surprises: downward-cascade checkboxes with an outcome preview, everything soft-deleted with 30-day trash and instant undo
- Rates resolve server-side (entry override → task → project → client → org default), money and time always in tabular numerals
- Theme editor: presets, primary/neutral palette, radius, font, light/dark, starfield background
- Session auth (register/login) with scrypt password hashing; multi-user orgs

**Screenshots** (design reference): [Time](handoff_design_Tick/design_handoff_tick/screenshots/01-time.png) · [Dashboard](handoff_design_Tick/design_handoff_tick/screenshots/02-dashboard.png) · [Projects & tasks](handoff_design_Tick/design_handoff_tick/screenshots/05-projects-tasks.png) · [Clients](handoff_design_Tick/design_handoff_tick/screenshots/06-clients.png) · [Theme editor](handoff_design_Tick/design_handoff_tick/screenshots/08-settings-appearance.png) · [Manual entry](handoff_design_Tick/design_handoff_tick/screenshots/09-manual-entry-dialog.png) · [Cascade delete](handoff_design_Tick/design_handoff_tick/screenshots/10-cascade-delete-dialog.png) · [Mobile](handoff_design_Tick/design_handoff_tick/screenshots/11-mobile.png)

## Quickstart (Docker Compose)

Runs the app plus a bundled Postgres 17 with a persistent volume. Migrations apply automatically on startup.

```sh
git clone <this-repo> tick && cd tick
cp .env.example .env
# edit .env: set NUXT_SESSION_PASSWORD (openssl rand -base64 36)
docker compose up -d
```

Open http://localhost:3000 and register your first account.

### Docker run (bring your own Postgres)

```sh
docker run -d --name tick -p 3000:3000 \
  -e NUXT_DATABASE_URL='postgresql://tick:password@db-host:5432/tick' \
  -e NUXT_SESSION_PASSWORD="$(openssl rand -base64 36)" \
  ghcr.io/ikluhsman/tick:latest
```

Images are published to GHCR by CI on pushes to `main` (`latest`, `sha-…`) and on `v*` tags (semver).

## Native (Node + PM2)

Requires Node 22+ and a reachable Postgres.

```sh
npm ci
npm run build
export NUXT_DATABASE_URL='postgresql://tick:password@localhost:5432/tick'
export NUXT_SESSION_PASSWORD="$(openssl rand -base64 36)"   # keep it stable across restarts
node .output/server/index.mjs        # or:
pm2 start ecosystem.config.cjs       # see the file for env docs
```

The built server applies pending SQL migrations on startup (set `NUXT_AUTO_MIGRATE=false` to opt out). PM2 inherits your shell environment; for a persistent setup put the `NUXT_*` vars in your service manager's env file.

## Reverse proxy

For real deployments put nginx or Caddy in front of the app for TLS, compression and security headers. Ready-made configs live in [`deploy/`](deploy/) — [`nginx.conf.example`](deploy/nginx.conf.example) (public-TLS and internal plain-HTTP variants) and [`Caddyfile.example`](deploy/Caddyfile.example) (auto-TLS). Both pass the `X-Forwarded-*` headers Tick needs, allow 8 MB CSV imports, and keep the PWA service worker uncached so installed clients update promptly. See [`deploy/README.md`](deploy/README.md).

## Environment variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `NUXT_DATABASE_URL` | yes | — | Postgres connection string, e.g. `postgresql://tick:password@localhost:5432/tick` |
| `NUXT_SESSION_PASSWORD` | yes | — | Session cookie encryption secret, 32+ chars. Generate: `openssl rand -base64 36`. Changing it logs everyone out |
| `NUXT_AUTO_MIGRATE` | no | `true` | Apply pending SQL migrations on production startup; `false` to run them out-of-band (`npx drizzle-kit migrate`) |
| `NUXT_MIGRATIONS_DIR` | no | `<cwd>/server/db/migrations` | Override the migrations folder location |
| `NITRO_HOST` | no | `0.0.0.0` (image) | Bind address of the production server |
| `NITRO_PORT` | no | `3000` | Port of the production server |
| `POSTGRES_PASSWORD` | no | `tick` | docker-compose only: password for the bundled Postgres |
| `TICK_PORT` | no | `3000` | docker-compose only: host port the app is published on |

## Development

```sh
npm i
cp .env.example .env      # point NUXT_DATABASE_URL at a local Postgres
npm run db:push           # create the schema (dev uses push, not migrations)
npm run db:seed           # demo org + ~3 weeks of entries
npm run dev
```

Seed credentials: **mara@example.com** / **tick-demo** (org "Hollow Studio").

Other scripts: `npm run typecheck`, `npm run db:generate` (new SQL migration from schema changes — commit the `server/db/migrations` output so deployed instances pick it up).

Stack: Nuxt 4 · Nuxt UI 4 · Tailwind 4 · Pinia · Drizzle ORM + postgres.js · nuxt-auth-utils · GSAP · Zod. Design handoff (mocks, tokens, data rules) lives in `handoff_design_Tick/design_handoff_tick/`.

## License

MIT — see [LICENSE](LICENSE).
