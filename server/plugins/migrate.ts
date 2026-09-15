// Nitro startup plugin — applies pending Drizzle SQL migrations before the server accepts traffic.
// Runs only in the built output (production). Dev uses `npm run db:push` instead, and the dev DB
// is not migration-tracked, so replaying 0000 there would fail on existing tables.
// Disable with NUXT_AUTO_MIGRATE=false (e.g. when migrations are applied out-of-band).
//
// Nitro neither awaits an async plugin nor honours its rejection — it opens the
// listener first and its unhandledRejection handler logs and carries on, so
// `throw` here used to leave the server answering requests against a
// half-migrated schema (ticktimer/Tick#9). Two things replace it: every path
// out of this plugin ends in markStartupReady() or process.exit(1), and until
// it does, server/middleware/00.readiness.ts answers 503.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { markStartupReady } from '../utils/startup-ready'

/**
 * Exit non-zero so the container restarts (compose `restart: unless-stopped`)
 * and the healthcheck reports unhealthy instead of a silent half-migration.
 * stderr is a pipe under Docker and CI, where writes are asynchronous — wait
 * for the flush, or process.exit() drops the very message explaining the exit.
 */
async function die(message: string, err: unknown): Promise<never> {
  const detail = err instanceof Error ? (err.stack ?? err.message) : String(err)
  await new Promise<void>((resolve) => {
    process.stderr.write(`${message}\n${detail}\n`, () => resolve())
  })
  process.exit(1)
}

function resolveMigrationsFolder(): string | null {
  const candidates = [
    process.env.NUXT_MIGRATIONS_DIR,
    join(process.cwd(), 'server/db/migrations')
  ].filter((dir): dir is string => Boolean(dir))
  for (const dir of candidates) {
    if (existsSync(join(dir, 'meta/_journal.json'))) return dir
  }
  return null
}

export default defineNitroPlugin(async () => {
  // Every early return is a deliberate "nothing to wait for" — open the gate.
  if (import.meta.dev) return markStartupReady()
  if (process.env.NUXT_AUTO_MIGRATE === 'false') {
    console.info('[tick] NUXT_AUTO_MIGRATE=false — skipping migrations')
    return markStartupReady()
  }

  const databaseUrl = useRuntimeConfig().databaseUrl
  if (!databaseUrl) {
    console.warn('[tick] NUXT_DATABASE_URL is not set — skipping migrations')
    return markStartupReady()
  }

  const migrationsFolder = resolveMigrationsFolder()
  if (!migrationsFolder) {
    console.warn('[tick] migrations folder not found (looked for server/db/migrations next to the process cwd; override with NUXT_MIGRATIONS_DIR) — skipping migrations')
    return markStartupReady()
  }

  // Dedicated single connection so migration locks don't tie up the app pool.
  const client = postgres(databaseUrl, { max: 1 })
  let failure: unknown = null
  try {
    await migrate(drizzle(client), { migrationsFolder })
    console.info(`[tick] database migrations up to date (${migrationsFolder})`)
  } catch (err) {
    failure = err
  } finally {
    // Closing first: process.exit() below skips `finally`.
    await client.end().catch(() => {})
  }

  // Never mark ready on failure — the gate stays shut for the process's last
  // moments, so an in-flight request gets a 503 and never a half-migrated 200.
  if (failure) {
    await die(
      '[tick] database migration failed — refusing to serve traffic against a half-migrated schema',
      failure
    )
  }
  markStartupReady()
})
