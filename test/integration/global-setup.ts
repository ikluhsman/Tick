/**
 * Vitest globalSetup for the integration suite.
 *
 *  1. Build the app once into `.nuxt/it/output` (isolated from the dev server).
 *  2. Make sure the TEST database has the schema (drizzle-kit push) and the
 *     demo seed (idempotent — only seeded when missing, so a suite run never
 *     clobbers data another session is using).
 *  3. Boot the shared server on :3801 with the auth rate limiter DISABLED, so
 *     the hundreds of logins the suite performs can't trip it. The limiter has
 *     its own dedicated server in rate-limit.test.ts.
 *
 * State isolation between test files is by construction: every file registers
 * its own user + org (see registerAccount), so no file depends on another
 * file's rows, on execution order, or on the seed.
 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { resetDemoData } from '../../server/utils/demo'
import {
  buildOnce,
  closeTestDb,
  PORT_MAIN,
  ROOT,
  schema,
  startServer,
  TEST_DATABASE_URL,
  testDb,
  type TestServer
} from '../helpers/server'

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((res, rej) => {
    const child = spawn(cmd, args, {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, NUXT_DATABASE_URL: TEST_DATABASE_URL }
    })
    child.on('error', rej)
    child.on('exit', code =>
      code === 0 ? res() : rej(new Error(`${cmd} ${args.join(' ')} exited with ${code}`))
    )
  })
}

async function ensureSchema(): Promise<void> {
  const db = testDb()
  try {
    await db.select({ id: schema.users.id }).from(schema.users).limit(1)
  } catch {
    // Fresh database: create the schema, then re-check (fail loudly if it's
    // still broken rather than letting 40 tests fail one by one).
    await run(resolve(ROOT, 'node_modules/.bin/drizzle-kit'), ['push', '--force'])
    await db.select({ id: schema.users.id }).from(schema.users).limit(1)
  }
}

async function ensureSeed(): Promise<void> {
  const db = testDb()
  const existing = await db.query.users.findFirst({
    columns: { id: true },
    where: (u, { eq }) => eq(u.email, 'mara@example.com')
  })
  if (!existing) await resetDemoData(db)
}

let server: TestServer | null = null

export default async function setup() {
  await buildOnce()
  await ensureSchema()
  await ensureSeed()
  server = await startServer({
    port: PORT_MAIN,
    env: { NUXT_AUTH_RATE_LIMIT: '0' }
  })

  return async () => {
    await server?.close()
    await closeTestDb()
  }
}
