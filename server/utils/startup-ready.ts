// Readiness gate for asynchronous startup work.
//
// Nitro does not await async plugins: the HTTP listener is open while they are
// still running, and an async plugin's rejection is only logged (see the note
// in server/plugins/00.session-cookie.ts — a *sync* plugin can throw and abort
// startup, an async one cannot). server/plugins/migrate.ts therefore reports in
// here instead, and server/middleware/00.readiness.ts refuses traffic until it
// does, so no request is ever answered against a half-migrated schema.
//
// Module state, shared by everything in the server bundle. Every path out of
// the migrate plugin must end in markStartupReady() or process.exit(1).

let ready = false
let resolveReady: () => void
const readyPromise = new Promise<void>((resolve) => {
  resolveReady = resolve
})

/** Called once startup work has finished (or was skipped). Idempotent. */
export function markStartupReady(): void {
  if (ready) return
  ready = true
  resolveReady()
}

export function isStartupReady(): boolean {
  return ready
}

/** Resolves when startup work is done. Never rejects — failure exits the process. */
export function whenStartupReady(): Promise<void> {
  return readyPromise
}
