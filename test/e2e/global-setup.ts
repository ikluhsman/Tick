// Runs once before the suite (after Playwright has started the web server):
//  1. push the Drizzle schema into the dedicated tick_test database,
//  2. reseed it, so every run starts from the same deterministic fixture,
//  3. log the seeded user in once and park the session in a storageState file
//     that every spec reuses (auth.spec opts out and drives the real form).
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { request, type FullConfig } from '@playwright/test'
import { SEED_USER, TEST_DATABASE_URL } from './helpers/fixtures'

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')
const STORAGE_STATE = resolve(ROOT, 'test/e2e/.cache/storage-state.json')

function run(args: string[]) {
  execFileSync('npm', args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, NUXT_DATABASE_URL: TEST_DATABASE_URL }
  })
}

export default async function globalSetup(config: FullConfig) {
  run(['run', 'db:push', '--', '--force'])
  run(['run', 'db:seed'])

  const baseURL = config.projects[0]?.use.baseURL ?? 'http://127.0.0.1:3804'
  const ctx = await request.newContext({ baseURL })
  const res = await ctx.post('/api/auth/login', {
    data: { email: SEED_USER.email, password: SEED_USER.password }
  })
  if (!res.ok()) {
    throw new Error(`e2e global setup: login failed (${res.status()}) — ${await res.text()}`)
  }
  mkdirSync(dirname(STORAGE_STATE), { recursive: true })
  await ctx.storageState({ path: STORAGE_STATE })
  await ctx.dispose()
}
