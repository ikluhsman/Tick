// Demo-mode data reset (NUXT_DEMO_MODE=true only, else inert). Every hour,
// compare a marker file in .data/ against the DB reset threshold: when the
// last reset is missing or >24h old, wipe + reseed the demo org via
// resetDemoData() (server/utils/demo.ts — same code path as `npm run
// db:seed`) and rewrite the marker. File marker (not a DB row) so the
// schema stays untouched; .data/ is gitignored and survives restarts.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export default defineNitroPlugin(() => {
  if (!useRuntimeConfig().demoMode) return

  const dir = join(process.cwd(), '.data')
  const marker = join(dir, 'demo-last-reset')

  async function maybeReset() {
    let last: string | null = null
    try {
      last = readFileSync(marker, 'utf8').trim()
    } catch {
      // no marker yet → reset now
    }
    if (!shouldResetDemo(last)) return
    try {
      const c = await resetDemoData(useDrizzle())
      mkdirSync(dir, { recursive: true })
      writeFileSync(marker, new Date().toISOString())
      console.log(`[demo] data reset: ${c.entries} entries reseeded`)
    } catch (err) {
      console.error('[demo] data reset failed:', err)
    }
  }

  maybeReset()
  setInterval(maybeReset, 3_600_000)
})
