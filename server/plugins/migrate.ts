// Nitro startup plugin — applies pending Drizzle SQL migrations before the server accepts traffic.
// Runs only in the built output (production). Dev uses `npm run db:push` instead, and the dev DB
// is not migration-tracked, so replaying 0000 there would fail on existing tables.
// Disable with NUXT_AUTO_MIGRATE=false (e.g. when migrations are applied out-of-band).
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

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
  if (import.meta.dev) return
  if (process.env.NUXT_AUTO_MIGRATE === 'false') {
    console.info('[tick] NUXT_AUTO_MIGRATE=false — skipping migrations')
    return
  }

  const databaseUrl = useRuntimeConfig().databaseUrl
  if (!databaseUrl) {
    console.warn('[tick] NUXT_DATABASE_URL is not set — skipping migrations')
    return
  }

  const migrationsFolder = resolveMigrationsFolder()
  if (!migrationsFolder) {
    console.warn('[tick] migrations folder not found (looked for server/db/migrations next to the process cwd; override with NUXT_MIGRATIONS_DIR) — skipping migrations')
    return
  }

  // Dedicated single connection so migration locks don't tie up the app pool.
  const client = postgres(databaseUrl, { max: 1 })
  try {
    await migrate(drizzle(client), { migrationsFolder })
    console.info(`[tick] database migrations up to date (${migrationsFolder})`)
  } catch (err) {
    console.error('[tick] database migration failed', err)
    throw err // fail fast: a half-migrated schema should not serve traffic
  } finally {
    await client.end()
  }
})
