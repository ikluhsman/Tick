// ticktimer/Tick#11 — undo after a cascade delete that is too big to describe.
//
// Undo used to POST the whole DeleteResult back: every uuid the delete touched.
// /api/restore capped those arrays (10k entries, 5k tasks, 1k clients) and the
// global 1MB body limit holds roughly 27k uuids anyway, so deleting a busy
// client and clicking Undo restored nothing at all — the data simply stayed in
// the trash. The cascade now records the operation as a delete_batches row and
// stamps delete_batch_id on everything it trashes, so undo names it with one id.
//
// The entries here are inserted straight into the database: 12k of them over
// HTTP would be the slowest thing in the suite by an order of magnitude, and
// what is under test is the delete/undo pair, not entry creation.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import {
  closeTestDb,
  registerAccount,
  schema,
  testDb,
  type ApiClient,
  type TestAccount
} from '../helpers/server'

/** Past the old `.max(10000)` cap on `deleted.entries`, with room to spare. */
const BIG = 12_000

let acct: TestAccount
let api: ApiClient
let orgId: string
let userId: string

beforeAll(async () => {
  acct = await registerAccount()
  api = acct.client
  orgId = acct.user.orgId
  userId = acct.user.id
}, 60_000)

afterAll(async () => {
  await closeTestDb()
})

interface BigTree {
  clientId: string
  projectId: string
  entryIds: string[]
}

/**
 * A client → project with `count` ended entries pointing at the project.
 * Entries are bulk-inserted in chunks; one giant VALUES list would blow past
 * Postgres' 65,535-parameter limit.
 */
async function makeBigTree(count: number): Promise<BigTree> {
  const db = testDb()
  const client = (await api.post('/api/clients', { name: `Big ${Date.now()}`, rate: 100 })).body
  const project = (await api.post('/api/projects', { name: 'Big project', clientId: client.id })).body

  const base = new Date(2026, 0, 5, 9, 0, 0, 0).getTime()
  const rows = Array.from({ length: count }, (_, i) => ({
    orgId,
    userId,
    name: `bulk-${i}`,
    refType: 'project' as const,
    refId: project.id as string,
    billable: true,
    start: new Date(base + i * 60_000),
    end: new Date(base + i * 60_000 + 30_000)
  }))

  const entryIds: string[] = []
  for (let i = 0; i < rows.length; i += 1000) {
    const inserted = await db
      .insert(schema.timeEntries)
      .values(rows.slice(i, i + 1000))
      .returning({ id: schema.timeEntries.id })
    entryIds.push(...inserted.map(r => r.id))
  }
  return { clientId: client.id, projectId: project.id, entryIds }
}

/** How many of these entry ids are currently in the trash. */
async function trashedCount(ids: string[]): Promise<number> {
  const db = testDb()
  let total = 0
  for (let i = 0; i < ids.length; i += 1000) {
    const rows = await db
      .select({ id: schema.timeEntries.id })
      .from(schema.timeEntries)
      .where(
        and(
          eq(schema.timeEntries.orgId, orgId),
          inArray(schema.timeEntries.id, ids.slice(i, i + 1000)),
          isNotNull(schema.timeEntries.deletedAt)
        )
      )
    total += rows.length
  }
  return total
}

describe(`a cascade delete of ${BIG} entries`, () => {
  it('is undone in full by its batch id', async () => {
    const tree = await makeBigTree(BIG)

    const del = await api.del(`/api/clients/${tree.clientId}`, {
      cascadeProjects: true,
      cascadeTasks: true,
      cascadeEntries: true
    })
    expect(del.status).toBe(200)
    expect(del.body.deleted.entries).toHaveLength(BIG)
    // The whole operation, named in one id.
    expect(del.body.batchId).toMatch(/^[0-9a-f-]{36}$/)
    expect(await trashedCount(tree.entryIds)).toBe(BIG)

    // What the undo toast now sends — no id list, so nothing to cap.
    const undo = await api.post('/api/restore', { batchId: del.body.batchId })
    expect(undo.status).toBe(200)
    expect(undo.body.restored).toMatchObject({ clients: 1, projects: 1, entries: BIG })
    expect(await trashedCount(tree.entryIds)).toBe(0)
  }, 120_000)

  it('is rejected by the old snapshot form, which is why the batch id exists', async () => {
    const ids = Array.from({ length: BIG }, () => crypto.randomUUID())
    const res = await api.post('/api/restore', {
      deleted: { clients: [], projects: [], tasks: [], entries: ids, tags: [] }
    })
    // 400 from the .max(10000) cap, or 413 from the 1MB body limit first.
    expect([400, 413]).toContain(res.status)
  }, 60_000)
})

describe('a batch id from another org', () => {
  it('restores nothing and 404s', async () => {
    const other = await registerAccount()
    const client = (await other.client.post('/api/clients', { name: 'Theirs', rate: 50 })).body
    const del = await other.client.del(`/api/clients/${client.id}`, {})
    expect(del.status).toBe(200)

    const res = await api.post('/api/restore', { batchId: del.body.batchId })
    expect(res.status).toBe(404)

    // Their client is still in the trash — the 404 was not a partial restore.
    const db = testDb()
    const [row] = await db
      .select({ deletedAt: schema.clients.deletedAt })
      .from(schema.clients)
      .where(eq(schema.clients.id, client.id))
      .limit(1)
    expect(row?.deletedAt).not.toBe(null)
  }, 60_000)
})

describe('the batch stamp', () => {
  it('is cleared on restore, so a later delete is not undone by the old batch', async () => {
    const client = (await api.post('/api/clients', { name: `Stamp ${Date.now()}`, rate: 10 })).body
    const first = await api.del(`/api/clients/${client.id}`, {})
    expect(first.status).toBe(200)
    await api.post('/api/restore', { batchId: first.body.batchId })

    // Trashed again, this time by a delete that has its own batch.
    const second = await api.del(`/api/clients/${client.id}`, {})
    expect(second.status).toBe(200)

    // Undoing the FIRST batch must not touch what the second one trashed.
    const stale = await api.post('/api/restore', { batchId: first.body.batchId })
    expect(stale.status).toBe(200)
    expect(stale.body.restored.clients).toBe(0)

    const db = testDb()
    const [row] = await db
      .select({ deletedAt: schema.clients.deletedAt })
      .from(schema.clients)
      .where(and(eq(schema.clients.id, client.id), isNull(schema.clients.deletedAt)))
      .limit(1)
    expect(row).toBeUndefined()
  }, 60_000)
})
