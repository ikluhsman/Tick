// Small object factories for the server-side unit specs.
//
// Everything here is deterministic: ids come from a per-process counter, never
// from randomness or the clock, so a failing assertion prints a stable id.
// Nothing touches a database — `makeRateContext` builds the exact in-memory
// shape `loadRateContext()` returns, which is all the pure Rule 2 helpers need.
import type { CtxClient, CtxProject, CtxTask, RateContext } from '../../server/utils/rates'

let seq = 0

/** Stable, readable, unique-per-process id (e.g. "client-1"). */
export function makeId(prefix = 'id'): string {
  seq += 1
  return `${prefix}-${seq}`
}

/** Deterministic UUIDv4-shaped id — for specs that insert into Postgres uuid columns. */
export function makeUuid(): string {
  seq += 1
  const hex = seq.toString(16).padStart(12, '0')
  return `00000000-0000-4000-8000-${hex}`
}

export function makeClient(over: Partial<CtxClient> = {}): CtxClient {
  return { id: makeId('client'), name: 'Acme Co', rate: null, ...over }
}

export function makeProject(over: Partial<CtxProject> = {}): CtxProject {
  return {
    id: makeId('project'),
    name: 'Website redesign',
    clientId: null,
    rate: null,
    billableDefault: true,
    estimateMinutes: null,
    visibility: 'private',
    archived: false,
    ...over
  }
}

export function makeTask(over: Partial<CtxTask> = {}): CtxTask {
  return {
    id: makeId('task'),
    name: 'Hero layout pass',
    projectId: null,
    estimateMinutes: null,
    done: false,
    ...over
  }
}

/** Minimal entry shape accepted by `resolveEntryRate`. */
export interface EntryLike {
  userId: string
  refType: string | null
  refId: string | null
  rateOverride: number | null
}

export function makeEntry(over: Partial<EntryLike> = {}): EntryLike {
  return { userId: 'user-1', refType: null, refId: null, rateOverride: null, ...over }
}

export interface RateContextParts {
  clients?: CtxClient[]
  projects?: CtxProject[]
  tasks?: CtxTask[]
  /** userId → the org_member.rate / user.default_rate pair */
  userRates?: Record<string, { memberRate: number | null, defaultRate: number | null }>
}

/** Builds the same in-memory shape `loadRateContext(db, orgId)` returns. */
export function makeRateContext(parts: RateContextParts = {}): RateContext {
  return {
    clients: new Map((parts.clients ?? []).map(c => [c.id, c])),
    projects: new Map((parts.projects ?? []).map(p => [p.id, p])),
    tasks: new Map((parts.tasks ?? []).map(t => [t.id, t])),
    userRates: new Map(Object.entries(parts.userRates ?? {}))
  }
}

/** Rows → CSV text. `eol` lets a spec exercise CRLF/CR parsing explicitly. */
export function toCsv(rows: string[][], eol = '\n'): string {
  return rows
    .map(r => r.map(c => (/[",\n\r]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
    .join(eol)
}
