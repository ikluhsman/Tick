// ticktimer/Tick#9 — what a production boot does with the auto-migration.
//
// Nitro opens the listener before async plugins finish and only *logs* their
// rejections, so the old `throw err // fail fast` in server/plugins/migrate.ts
// never stopped anything: the server answered requests against a half-migrated
// schema. This file boots the real built server against the test database with
// a migrations folder of its own and watches what the process does.
//
// The migrations folder is a temporary one (NUXT_MIGRATIONS_DIR) rather than
// the shipped server/db/migrations: the test database is managed with
// `db:push` and carries no drizzle journal, so replaying 0000 over it would
// fail for the wrong reason. A failing migration is one that raises; a
// succeeding one is a `SELECT 1`. Neither touches an application table.
//
// Each boot is its own server on PORT_MIGRATE, unrelated to the shared one the
// globalSetup runs — these processes are expected to die.
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import {
  buildOnce,
  closeTestDb,
  OUTPUT_DIR,
  PORT_MIGRATE,
  ROOT,
  sleep,
  TEST_DATABASE_URL,
  testDb
} from '../helpers/server'

const SERVER_ENTRY = resolve(OUTPUT_DIR, 'server/index.mjs')
const URL_BASE = `http://127.0.0.1:${PORT_MIGRATE}`

/** A migration that always raises, touching nothing. */
const FAILING_SQL = `DO $$ BEGIN RAISE EXCEPTION 'tick#9 deliberate migration failure'; END $$;`
/** A migration that always succeeds, touching nothing. */
const HARMLESS_SQL = `SELECT 1;`

/**
 * A drizzle migrations folder holding one migration. `when` decides whether the
 * migrator considers it pending: anything greater than the newest row already
 * in drizzle.__drizzle_migrations gets applied.
 */
async function migrationsFolder(tag: string, body: string, when: number): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'tick-mig-'))
  await mkdir(join(dir, 'meta'), { recursive: true })
  await writeFile(join(dir, `${tag}.sql`), body)
  await writeFile(
    join(dir, 'meta/_journal.json'),
    JSON.stringify({
      version: '7',
      dialect: 'postgresql',
      entries: [{ idx: 0, version: '7', when, tag, breakpoints: true }]
    })
  )
  return dir
}

interface Boot {
  /** null while the process is still running. */
  exitCode: number | null
  logs: string
  /** Every HTTP status the server handed out while it was alive. */
  statuses: number[]
  kill: () => Promise<void>
}

/**
 * Boot the built server with `migrationsDir`, polling it throughout so we can
 * assert on what it served — not just on how it ended.
 */
async function boot(migrationsDir: string, waitMs: number): Promise<Boot> {
  await buildOnce()
  const logs: string[] = []
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NITRO_HOST: '127.0.0.1',
      NITRO_PORT: String(PORT_MIGRATE),
      PORT: String(PORT_MIGRATE),
      NUXT_SESSION_PASSWORD: 'tick-migrate-boot-password-not-a-secret',
      NUXT_SESSION_COOKIE_SECURE: 'false',
      // The point of the exercise: leave auto-migration ON.
      NUXT_AUTO_MIGRATE: 'true',
      NUXT_MIGRATIONS_DIR: migrationsDir,
      NUXT_DATABASE_URL: TEST_DATABASE_URL
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout?.on('data', (d: Buffer) => logs.push(d.toString()))
  child.stderr?.on('data', (d: Buffer) => logs.push(d.toString()))

  let exitCode: number | null = null
  child.on('exit', code => (exitCode = code))

  // Poll from before the listener is up until the process dies or time runs out,
  // so a server that answers during the migration window cannot slip through.
  const statuses: number[] = []
  const deadline = Date.now() + waitMs
  while (exitCode === null && Date.now() < deadline) {
    try {
      const res = await fetch(`${URL_BASE}/api/me`, { redirect: 'manual' })
      statuses.push(res.status)
    } catch {
      // Nothing listening yet (or already gone).
    }
    await sleep(50)
  }

  return {
    exitCode,
    logs: logs.join(''),
    statuses,
    kill: () =>
      new Promise<void>((res) => {
        if (exitCode !== null) return res()
        child.once('exit', () => res())
        child.kill('SIGTERM')
        setTimeout(() => child.kill('SIGKILL'), 4000).unref()
      })
  }
}

afterAll(async () => {
  // The migrator creates drizzle.__drizzle_migrations in the test database.
  // Drop it so a rerun starts from the same place (no app table is involved).
  // Table first, then the schema without CASCADE — CASCADE logs a NOTICE per
  // dependent object, which postgres.js prints over the reporter.
  await testDb().execute(sql`DROP TABLE IF EXISTS drizzle.__drizzle_migrations`)
  await testDb().execute(sql`DROP SCHEMA IF EXISTS drizzle`)
  await closeTestDb()
})

describe('a migration that fails', () => {
  it('exits the process non-zero and never serves a request', async () => {
    // Dated far ahead so it is pending whatever the database has seen before.
    const dir = await migrationsFolder('0000_boom', FAILING_SQL, Date.now() + 3_600_000)
    const run = await boot(dir, 30_000)
    await run.kill()

    expect(run.exitCode).toBe(1)
    expect(run.logs).toContain('database migration failed')
    // The whole point: no 200 (nor any 2xx/3xx) ever left this server.
    expect(run.statuses.filter(s => s < 500)).toEqual([])
  }, 60_000)
})

describe('a migration that succeeds', () => {
  it('applies it, then serves traffic', async () => {
    const dir = await migrationsFolder('0000_noop', HARMLESS_SQL, Date.now())
    const run = await boot(dir, 2_000)
    try {
      expect(run.exitCode).toBe(null)
      expect(run.logs).toContain('database migrations up to date')
      // The readiness gate is open: the auth guard answers, not a 503.
      const res = await fetch(`${URL_BASE}/api/me`, { redirect: 'manual' })
      expect(res.status).toBe(401)
    } finally {
      await run.kill()
    }
  }, 60_000)
})
