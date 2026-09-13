// Playwright `webServer` command: build the app if the bundle is stale, then
// boot the Nitro node-server in this process (so Playwright killing the command
// kills the server). Everything points at the dedicated tick_test database —
// the dev server on 3790 and its database are never touched.
import { buildIfStale, SERVER_ENTRY } from './build.mjs'

process.env.NODE_ENV = 'production'
process.env.NUXT_DATABASE_URL
  ??= 'postgresql://tick:tick_dev_password@localhost:5432/tick_test'
process.env.NUXT_SESSION_PASSWORD ??= 'tick-e2e-session-password-not-a-secret'
// Auth endpoints are IP-rate-limited (10 POST/min); a suite that logs in
// repeatedly would trip it. 0 disables the limiter — see
// server/middleware/01.rate-limit.ts.
process.env.NUXT_AUTH_RATE_LIMIT ??= '0'
// The test database is managed with `db:push` (globalSetup), so it carries no
// drizzle migration journal — replaying 0000 over it would fail on existing
// tables. This is the documented escape hatch in server/plugins/migrate.ts.
process.env.NUXT_AUTO_MIGRATE ??= 'false'
process.env.PORT ??= '3804'
process.env.NITRO_PORT = process.env.PORT
process.env.HOST ??= '127.0.0.1'

buildIfStale()

console.log(`[e2e] starting Nitro on ${process.env.HOST}:${process.env.PORT}`)
await import(SERVER_ENTRY)
