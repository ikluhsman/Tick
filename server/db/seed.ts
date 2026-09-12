// Tick dev seed — run with `npm run db:seed` (tsx, no Nuxt context).
// Thin CLI wrapper around resetDemoData() (server/utils/demo.ts), which the
// demo-mode reset plugin shares. Idempotent; leaves NO running entry.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { resetDemoData } from '../utils/demo'
import * as schema from './schema'

// ---------------------------------------------------------------- env (.env)
// tsx doesn't load .env — parse it ourselves; real env vars win.
function loadDatabaseUrl(): string {
  if (process.env.NUXT_DATABASE_URL) return process.env.NUXT_DATABASE_URL
  const envPath = fileURLToPath(new URL('../../.env', import.meta.url))
  const env: Record<string, string> = {}
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (m) env[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, '$2')
  }
  const url = env.NUXT_DATABASE_URL
  if (!url) throw new Error('NUXT_DATABASE_URL not found in environment or .env')
  return url
}

async function main() {
  const client = postgres(loadDatabaseUrl(), { max: 1 })
  const db = drizzle(client, { schema })
  const c = await resetDemoData(db)
  console.log(
    `Seeded: 1 user, 1 org, 3 clients, 4 projects, ${c.tasks} tasks, ` +
      `${c.tags} tags, ${c.entries} entries (${c.tagLinks} tag links), 0 running.`
  )
  await client.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
