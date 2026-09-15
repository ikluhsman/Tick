// server/utils/startup-ready.ts — the gate server/middleware/00.readiness.ts
// reads and server/plugins/migrate.ts opens (ticktimer/Tick#9).
//
// The module is deliberately singleton state, so every case re-imports it
// through vi.resetModules() to get a fresh, closed gate.
import { describe, expect, it, vi } from 'vitest'

async function freshGate() {
  vi.resetModules()
  return import('../../server/utils/startup-ready')
}

/** Did `p` settle within a macrotask, or is it still pending? */
async function settled(p: Promise<unknown>): Promise<boolean> {
  const pending = Symbol('pending')
  const race = await Promise.race([
    p.then(() => 'resolved'),
    new Promise(resolve => setTimeout(() => resolve(pending), 0))
  ])
  return race !== pending
}

describe('startup readiness gate', () => {
  it('starts closed — the server must refuse traffic before anything opens it', async () => {
    const gate = await freshGate()
    expect(gate.isStartupReady()).toBe(false)
    expect(await settled(gate.whenStartupReady())).toBe(false)
  })

  it('opens on markStartupReady, resolving waiters', async () => {
    const gate = await freshGate()
    const waiter = gate.whenStartupReady()
    gate.markStartupReady()
    expect(gate.isStartupReady()).toBe(true)
    expect(await settled(waiter)).toBe(true)
  })

  it('is idempotent — the migrate plugin has several paths to the same call', async () => {
    const gate = await freshGate()
    gate.markStartupReady()
    gate.markStartupReady()
    expect(gate.isStartupReady()).toBe(true)
    expect(await settled(gate.whenStartupReady())).toBe(true)
  })

  it('resolves a waiter that only arrives after the gate opened', async () => {
    const gate = await freshGate()
    gate.markStartupReady()
    expect(await settled(gate.whenStartupReady())).toBe(true)
  })
})
