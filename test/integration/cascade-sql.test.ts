// Rule 3 — the SQL half of the downward cascade (Projects ⇒ Tasks ⇒ Entries)
// and the relink snapshot that makes undo lossless.
//
// Every export of server/utils/cascade.ts is a Drizzle transaction, and what is
// under test here IS the SQL: which rows soft-delete, which get detached, what
// the snapshot remembers. Mocking Drizzle would test the mock, so this file
// calls the real functions against the TEST database — which is why it lives in
// the integration suite and not in `npm test` (ticktimer/Tick#13). The decision
// it applies is unit-tested on its own in test/unit/cascade-plan.spec.ts.
//
// This is the one integration file that drives the utils directly instead of
// going over HTTP; test/integration/cascade.test.ts covers the same rules
// through the API, including restore.
//
// Isolation: every test creates its own org + user, so no test can see another
// test's rows and file order is irrelevant. Nothing asserts on wall-clock time;
// `deleted_at` is only ever checked for null / not-null.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { and, eq, inArray, isNull } from '../../server/utils/drizzle'
import type { DB } from '../../server/utils/drizzle'
import {
  cascadeDeleteClient,
  cascadeDeleteProject,
  clientCascadeCounts,
  deleteTaskWithDetach,
  projectCascadeCounts
} from '../../server/utils/cascade'
import type { CascadeDeleteResult } from '../../server/utils/cascade'
import { closeTestDb, schema, testDb } from '../helpers/server'

let db: DB
const createdOrgs: string[] = []
const createdUsers: string[] = []

beforeAll(() => {
  // `createError` is a Nitro auto-import; cascade.ts calls it for 404s.
  vi.stubGlobal('createError', (opts: { statusCode?: number, message?: string }) =>
    Object.assign(new Error(opts.message ?? 'Error'), opts))
  db = testDb()
})

afterAll(async () => {
  if (createdOrgs.length) await db.delete(schema.orgs).where(inArray(schema.orgs.id, createdOrgs))
  if (createdUsers.length) {
    await db.delete(schema.users).where(inArray(schema.users.id, createdUsers))
  }
  await closeTestDb()
})

/* ------------------------------------------------------------------ fixture */

const START = new Date('2026-03-02T09:00:00.000Z')
const END = new Date('2026-03-02T10:00:00.000Z')

async function newOrg() {
  const orgId = randomUUID()
  const userId = randomUUID()
  await db.insert(schema.orgs).values({ id: orgId, name: `Test Org ${orgId.slice(0, 8)}` })
  await db.insert(schema.users).values({
    id: userId,
    name: 'Test User',
    email: `${userId}@test.invalid`,
    passwordHash: 'x:x',
    defaultRate: 85
  })
  await db.insert(schema.orgMembers).values({ orgId, userId, role: 'owner', rate: null })
  createdOrgs.push(orgId)
  createdUsers.push(userId)
  return { orgId, userId }
}

interface Fixture {
  orgId: string
  userId: string
  clientId: string
  projectA: string
  projectB: string
  taskId: string
  /** ended, ref → client */
  entryOnClient: string
  /** ended, ref → projectA */
  entryOnProject: string
  /** ended, ref → task */
  entryOnTask: string
  /** running (end IS NULL), ref → task */
  entryRunning: string
  /** ended, no ref at all — must never be touched */
  entryLoose: string
  /** already trashed, ref → client — must never be touched */
  entryTrashed: string
}

/**
 * Client → 2 projects → 1 task, with one entry pointing at each level plus a
 * running one, a detached one and an already-trashed one.
 */
async function seedClientTree(): Promise<Fixture> {
  const { orgId, userId } = await newOrg()
  const clientId = randomUUID()
  const projectA = randomUUID()
  const projectB = randomUUID()
  const taskId = randomUUID()

  await db.insert(schema.clients).values({ id: clientId, orgId, name: 'Northwind Legal', rate: 110 })
  await db.insert(schema.projects).values([
    { id: projectA, orgId, clientId, name: 'Intake form', rate: 95 },
    { id: projectB, orgId, clientId, name: 'Website redesign', rate: null }
  ])
  await db.insert(schema.tasks).values({ id: taskId, orgId, projectId: projectA, name: 'Validation' })

  const ids = {
    entryOnClient: randomUUID(),
    entryOnProject: randomUUID(),
    entryOnTask: randomUUID(),
    entryRunning: randomUUID(),
    entryLoose: randomUUID(),
    entryTrashed: randomUUID()
  }
  await db.insert(schema.timeEntries).values([
    { id: ids.entryOnClient, orgId, userId, name: 'client work', refType: 'client', refId: clientId, start: START, end: END },
    { id: ids.entryOnProject, orgId, userId, name: 'project work', refType: 'project', refId: projectA, start: START, end: END },
    { id: ids.entryOnTask, orgId, userId, name: 'task work', refType: 'task', refId: taskId, start: START, end: END },
    { id: ids.entryRunning, orgId, userId, name: 'running', refType: 'task', refId: taskId, start: START, end: null },
    { id: ids.entryLoose, orgId, userId, name: 'detached', refType: null, refId: null, start: START, end: END },
    { id: ids.entryTrashed, orgId, userId, name: 'trashed', refType: 'client', refId: clientId, start: START, end: END, deletedAt: END }
  ])

  return { orgId, userId, clientId, projectA, projectB, taskId, ...ids }
}

/* ------------------------------------------------------------- read helpers */

async function readProject(id: string) {
  const [row] = await db.select().from(schema.projects).where(eq(schema.projects.id, id))
  return row!
}
async function readTask(id: string) {
  const [row] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id))
  return row!
}
async function readEntry(id: string) {
  const [row] = await db.select().from(schema.timeEntries).where(eq(schema.timeEntries.id, id))
  return row!
}
async function readClient(id: string) {
  const [row] = await db.select().from(schema.clients).where(eq(schema.clients.id, id))
  return row!
}

/**
 * Applies a CascadeDeleteResult in reverse the way POST /api/restore does:
 * clear `deleted_at` on the snapshot's ids, then re-apply the cleared refs.
 * Used to prove the snapshot is sufficient to rebuild the graph.
 */
async function restore(orgId: string, result: CascadeDeleteResult) {
  const { deleted, relinked } = result
  if (deleted.clients.length) {
    await db.update(schema.clients).set({ deletedAt: null })
      .where(and(eq(schema.clients.orgId, orgId), inArray(schema.clients.id, deleted.clients)))
  }
  if (deleted.projects.length) {
    await db.update(schema.projects).set({ deletedAt: null })
      .where(and(eq(schema.projects.orgId, orgId), inArray(schema.projects.id, deleted.projects)))
  }
  if (deleted.tasks.length) {
    await db.update(schema.tasks).set({ deletedAt: null })
      .where(and(eq(schema.tasks.orgId, orgId), inArray(schema.tasks.id, deleted.tasks)))
  }
  if (deleted.entries.length) {
    await db.update(schema.timeEntries).set({ deletedAt: null })
      .where(and(eq(schema.timeEntries.orgId, orgId), inArray(schema.timeEntries.id, deleted.entries)))
  }
  for (const p of relinked.projects) {
    await db.update(schema.projects).set({ clientId: p.clientId }).where(eq(schema.projects.id, p.id))
  }
  for (const t of relinked.tasks) {
    await db.update(schema.tasks).set({ projectId: t.projectId }).where(eq(schema.tasks.id, t.id))
  }
  for (const e of relinked.entries) {
    await db.update(schema.timeEntries).set({ refType: e.refType, refId: e.refId })
      .where(eq(schema.timeEntries.id, e.id))
  }
}

/* -------------------------------------------------------------------- specs */

describe('cascade counts (dialog numbers)', () => {
  it('counts the client subtree, excluding the running timer and trashed rows', async () => {
    const f = await seedClientTree()
    expect(await clientCascadeCounts(db, f.orgId, f.clientId)).toEqual({
      projects: 2,
      tasks: 1,
      entries: 3 // onClient + onProject + onTask; running and trashed excluded
    })
  })

  it('counts a project subtree without counting projects', async () => {
    const f = await seedClientTree()
    expect(await projectCascadeCounts(db, f.orgId, f.projectA)).toEqual({
      projects: 0,
      tasks: 1,
      entries: 2 // onProject + onTask
    })
  })

  it('404s on an unknown, trashed or foreign client', async () => {
    const f = await seedClientTree()
    const other = await seedClientTree()
    await expect(clientCascadeCounts(db, f.orgId, randomUUID())).rejects.toThrow('Client not found')
    await expect(clientCascadeCounts(db, f.orgId, other.clientId)).rejects.toThrow(
      'Client not found'
    )
    await cascadeDeleteClient(db, f.orgId, f.clientId, {
      cascadeProjects: false, cascadeTasks: false, cascadeEntries: false
    })
    await expect(clientCascadeCounts(db, f.orgId, f.clientId)).rejects.toThrow('Client not found')
  })
})

describe('cascadeDeleteClient — nothing checked (keep everything below)', () => {
  it('trashes only the client, detaches its projects and its direct entries', async () => {
    const f = await seedClientTree()
    const result = await cascadeDeleteClient(db, f.orgId, f.clientId, {
      cascadeProjects: false,
      cascadeTasks: false,
      cascadeEntries: false
    })

    expect(result.deleted).toEqual({
      clients: [f.clientId],
      projects: [],
      tasks: [],
      entries: []
    })
    expect(result.detached).toEqual({ projects: 2, tasks: 0, entries: 1 })

    expect((await readClient(f.clientId)).deletedAt).not.toBeNull()

    // Projects kept, client link cleared (their rate now falls back per Rule 2).
    for (const id of [f.projectA, f.projectB]) {
      const p = await readProject(id)
      expect(p.deletedAt).toBeNull()
      expect(p.clientId).toBeNull()
    }
    // The task's project survived, so the task is untouched.
    const task = await readTask(f.taskId)
    expect(task.deletedAt).toBeNull()
    expect(task.projectId).toBe(f.projectA)

    // Only the entry pointing DIRECTLY at the client loses its ref.
    const onClient = await readEntry(f.entryOnClient)
    expect(onClient.deletedAt).toBeNull()
    expect(onClient.refType).toBeNull()
    expect(onClient.refId).toBeNull()

    for (const id of [f.entryOnProject, f.entryOnTask, f.entryRunning]) {
      const e = await readEntry(id)
      expect(e.deletedAt).toBeNull()
      expect(e.refId).not.toBeNull()
    }
    // Untouched bystanders.
    expect((await readEntry(f.entryLoose)).deletedAt).toBeNull()
    expect((await readEntry(f.entryTrashed)).refId).toBe(f.clientId)
  })

  it('remembers client_id per kept project so undo can re-attach it', async () => {
    const f = await seedClientTree()
    const result = await cascadeDeleteClient(db, f.orgId, f.clientId, {
      cascadeProjects: false,
      cascadeTasks: false,
      cascadeEntries: false
    })

    expect([...result.relinked.projects].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [
        { id: f.projectA, clientId: f.clientId },
        { id: f.projectB, clientId: f.clientId }
      ].sort((a, b) => a.id.localeCompare(b.id))
    )
    expect(result.relinked.tasks).toEqual([])
    expect(result.relinked.entries).toEqual([
      { id: f.entryOnClient, refType: 'client', refId: f.clientId }
    ])

    // …and undo actually puts the graph back.
    await restore(f.orgId, result)
    expect((await readClient(f.clientId)).deletedAt).toBeNull()
    expect((await readProject(f.projectA)).clientId).toBe(f.clientId)
    expect((await readProject(f.projectB)).clientId).toBe(f.clientId)
    const restored = await readEntry(f.entryOnClient)
    expect(restored.refType).toBe('client')
    expect(restored.refId).toBe(f.clientId)
  })
})

describe('cascadeDeleteClient — everything checked', () => {
  it('trashes the whole subtree, keeps and detaches the running timer', async () => {
    const f = await seedClientTree()
    const result = await cascadeDeleteClient(db, f.orgId, f.clientId, {
      cascadeProjects: true,
      cascadeTasks: true,
      cascadeEntries: true
    })

    expect(result.deleted.clients).toEqual([f.clientId])
    expect([...result.deleted.projects].sort()).toEqual([f.projectA, f.projectB].sort())
    expect(result.deleted.tasks).toEqual([f.taskId])
    expect([...result.deleted.entries].sort()).toEqual(
      [f.entryOnClient, f.entryOnProject, f.entryOnTask].sort()
    )

    for (const id of [f.projectA, f.projectB]) {
      expect((await readProject(id)).deletedAt).not.toBeNull()
    }
    expect((await readTask(f.taskId)).deletedAt).not.toBeNull()
    for (const id of [f.entryOnClient, f.entryOnProject, f.entryOnTask]) {
      expect((await readEntry(id)).deletedAt).not.toBeNull()
    }

    // The running timer is never trashed by a cascade — it is detached instead.
    const running = await readEntry(f.entryRunning)
    expect(running.deletedAt).toBeNull()
    expect(running.end).toBeNull()
    expect(running.refType).toBeNull()
    expect(result.detached.entries).toBe(1)
    expect(result.relinked.entries).toEqual([
      { id: f.entryRunning, refType: 'task', refId: f.taskId }
    ])

    // Deleted projects/tasks keep their links (they are restored whole).
    expect((await readProject(f.projectA)).clientId).toBe(f.clientId)
    expect((await readTask(f.taskId)).projectId).toBe(f.projectA)
    expect(result.relinked.projects).toEqual([])
    expect(result.relinked.tasks).toEqual([])

    expect((await readEntry(f.entryLoose)).deletedAt).toBeNull()
  })

  it('restores the full subtree from the snapshot', async () => {
    const f = await seedClientTree()
    const result = await cascadeDeleteClient(db, f.orgId, f.clientId, {
      cascadeProjects: true,
      cascadeTasks: true,
      cascadeEntries: true
    })
    await restore(f.orgId, result)

    expect((await readClient(f.clientId)).deletedAt).toBeNull()
    expect((await readProject(f.projectA)).clientId).toBe(f.clientId)
    expect((await readTask(f.taskId)).projectId).toBe(f.projectA)
    for (const id of [f.entryOnClient, f.entryOnProject, f.entryOnTask, f.entryRunning]) {
      const e = await readEntry(id)
      expect(e.deletedAt).toBeNull()
      expect(e.refId).not.toBeNull()
    }
    expect((await readEntry(f.entryRunning)).refId).toBe(f.taskId)
  })
})

describe('cascadeDeleteClient — partial levels', () => {
  it('projects+tasks checked, entries unchecked → all time kept and detached', async () => {
    const f = await seedClientTree()
    const result = await cascadeDeleteClient(db, f.orgId, f.clientId, {
      cascadeProjects: true,
      cascadeTasks: true,
      cascadeEntries: false
    })

    expect(result.deleted.entries).toEqual([])
    expect(result.detached.entries).toBe(4)

    for (const id of [f.entryOnClient, f.entryOnProject, f.entryOnTask, f.entryRunning]) {
      const e = await readEntry(id)
      expect(e.deletedAt).toBeNull()
      expect(e.refType).toBeNull()
      expect(e.refId).toBeNull()
    }
    const byId = new Map(result.relinked.entries.map(r => [r.id, r]))
    expect(byId.get(f.entryOnClient)).toEqual({ id: f.entryOnClient, refType: 'client', refId: f.clientId })
    expect(byId.get(f.entryOnProject)).toEqual({ id: f.entryOnProject, refType: 'project', refId: f.projectA })
    expect(byId.get(f.entryOnTask)).toEqual({ id: f.entryOnTask, refType: 'task', refId: f.taskId })
    expect(byId.get(f.entryRunning)).toEqual({ id: f.entryRunning, refType: 'task', refId: f.taskId })

    await restore(f.orgId, result)
    expect((await readEntry(f.entryOnTask)).refId).toBe(f.taskId)
  })

  it('projects checked, tasks unchecked → kept tasks become standalone, snapshot keeps project_id', async () => {
    const f = await seedClientTree()
    const result = await cascadeDeleteClient(db, f.orgId, f.clientId, {
      cascadeProjects: true,
      cascadeTasks: false,
      cascadeEntries: false
    })

    expect(result.deleted.tasks).toEqual([])
    expect(result.detached.tasks).toBe(1)
    expect(result.relinked.tasks).toEqual([{ id: f.taskId, projectId: f.projectA }])

    const task = await readTask(f.taskId)
    expect(task.deletedAt).toBeNull()
    expect(task.projectId).toBeNull()

    // The task survived, so entries pointing at it keep their ref.
    expect((await readEntry(f.entryOnTask)).refId).toBe(f.taskId)
    // The project did not, so entries pointing at it are detached.
    expect((await readEntry(f.entryOnProject)).refType).toBeNull()

    await restore(f.orgId, result)
    expect((await readTask(f.taskId)).projectId).toBe(f.projectA)
    expect((await readEntry(f.entryOnProject)).refId).toBe(f.projectA)
  })

  it('entries checked while projects are kept → time trashed, catalog intact', async () => {
    const f = await seedClientTree()
    const result = await cascadeDeleteClient(db, f.orgId, f.clientId, {
      cascadeProjects: false,
      cascadeTasks: false,
      cascadeEntries: true
    })

    expect([...result.deleted.entries].sort()).toEqual(
      [f.entryOnClient, f.entryOnProject, f.entryOnTask].sort()
    )
    expect((await readProject(f.projectA)).deletedAt).toBeNull()
    expect((await readTask(f.taskId)).deletedAt).toBeNull()
    // Trashed entries keep their refs so a restore brings them back whole.
    expect((await readEntry(f.entryOnTask)).refId).toBe(f.taskId)
    // The running timer survives, untouched (its task is still alive).
    const running = await readEntry(f.entryRunning)
    expect(running.deletedAt).toBeNull()
    expect(running.refId).toBe(f.taskId)
    expect(result.detached.entries).toBe(0)
  })

  it('leaves a sibling org untouched', async () => {
    const mine = await seedClientTree()
    const theirs = await seedClientTree()
    await cascadeDeleteClient(db, mine.orgId, mine.clientId, {
      cascadeProjects: true, cascadeTasks: true, cascadeEntries: true
    })
    expect((await readClient(theirs.clientId)).deletedAt).toBeNull()
    expect((await readProject(theirs.projectA)).clientId).toBe(theirs.clientId)
    expect((await readEntry(theirs.entryOnTask)).deletedAt).toBeNull()
    expect((await readEntry(theirs.entryOnTask)).refId).toBe(theirs.taskId)
  })
})

describe('cascadeDeleteProject', () => {
  it('tasks unchecked → tasks kept standalone, snapshot remembers project_id', async () => {
    const f = await seedClientTree()
    const result = await cascadeDeleteProject(db, f.orgId, f.projectA, {
      cascadeTasks: false,
      cascadeEntries: false
    })

    expect(result.deleted).toEqual({
      clients: [],
      projects: [f.projectA],
      tasks: [],
      entries: []
    })
    expect(result.detached).toEqual({ projects: 0, tasks: 1, entries: 1 })
    expect(result.relinked.projects).toEqual([])
    expect(result.relinked.tasks).toEqual([{ id: f.taskId, projectId: f.projectA }])
    expect(result.relinked.entries).toEqual([
      { id: f.entryOnProject, refType: 'project', refId: f.projectA }
    ])

    expect((await readProject(f.projectA)).deletedAt).not.toBeNull()
    expect((await readProject(f.projectB)).deletedAt).toBeNull()
    expect((await readTask(f.taskId)).projectId).toBeNull()
    expect((await readEntry(f.entryOnProject)).refType).toBeNull()
    // The task lives, so its entries (including the running one) keep their ref.
    expect((await readEntry(f.entryOnTask)).refId).toBe(f.taskId)
    expect((await readEntry(f.entryRunning)).refId).toBe(f.taskId)
    // The client is not touched by a project delete.
    expect((await readClient(f.clientId)).deletedAt).toBeNull()

    await restore(f.orgId, result)
    expect((await readProject(f.projectA)).deletedAt).toBeNull()
    expect((await readTask(f.taskId)).projectId).toBe(f.projectA)
    expect((await readEntry(f.entryOnProject)).refId).toBe(f.projectA)
  })

  it('tasks + entries checked → subtree trashed, running timer detached and kept', async () => {
    const f = await seedClientTree()
    const result = await cascadeDeleteProject(db, f.orgId, f.projectA, {
      cascadeTasks: true,
      cascadeEntries: true
    })

    expect(result.deleted.tasks).toEqual([f.taskId])
    expect([...result.deleted.entries].sort()).toEqual([f.entryOnProject, f.entryOnTask].sort())
    expect((await readTask(f.taskId)).deletedAt).not.toBeNull()

    const running = await readEntry(f.entryRunning)
    expect(running.deletedAt).toBeNull()
    expect(running.refType).toBeNull()
    expect(result.relinked.entries).toEqual([
      { id: f.entryRunning, refType: 'task', refId: f.taskId }
    ])

    // An entry on the client is outside a project delete's subtree.
    expect((await readEntry(f.entryOnClient)).refId).toBe(f.clientId)
  })

  it('404s on an unknown or foreign project', async () => {
    const f = await seedClientTree()
    const other = await seedClientTree()
    await expect(
      cascadeDeleteProject(db, f.orgId, randomUUID(), { cascadeTasks: true, cascadeEntries: true })
    ).rejects.toThrow('Project not found')
    await expect(
      cascadeDeleteProject(db, f.orgId, other.projectA, {
        cascadeTasks: true,
        cascadeEntries: true
      })
    ).rejects.toThrow('Project not found')
    // The failed delete rolled back — nothing was touched.
    expect((await readProject(other.projectA)).deletedAt).toBeNull()
  })
})

describe('deleteTaskWithDetach', () => {
  it('trashes the task and detaches its entries without deleting any time', async () => {
    const f = await seedClientTree()
    const result = await deleteTaskWithDetach(db, f.orgId, f.taskId)

    expect(result.deleted).toEqual({ clients: [], projects: [], tasks: [f.taskId], entries: [] })
    expect(result.detached).toEqual({ projects: 0, tasks: 0, entries: 2 })

    expect((await readTask(f.taskId)).deletedAt).not.toBeNull()
    for (const id of [f.entryOnTask, f.entryRunning]) {
      const e = await readEntry(id)
      expect(e.deletedAt).toBeNull()
      expect(e.refType).toBeNull()
      expect(e.refId).toBeNull()
    }
    // The project and its own entry are untouched.
    expect((await readProject(f.projectA)).deletedAt).toBeNull()
    expect((await readEntry(f.entryOnProject)).refId).toBe(f.projectA)

    const snapshot = new Map(result.relinked.entries.map(r => [r.id, r.refId]))
    expect(snapshot.get(f.entryOnTask)).toBe(f.taskId)
    expect(snapshot.get(f.entryRunning)).toBe(f.taskId)

    await restore(f.orgId, result)
    expect((await readTask(f.taskId)).deletedAt).toBeNull()
    expect((await readEntry(f.entryOnTask)).refId).toBe(f.taskId)
  })

  it('404s on a task that is already trashed', async () => {
    const f = await seedClientTree()
    await deleteTaskWithDetach(db, f.orgId, f.taskId)
    await expect(deleteTaskWithDetach(db, f.orgId, f.taskId)).rejects.toThrow('Task not found')
  })
})

describe('cascade never hard-deletes', () => {
  it('every row the cascade touched is still queryable with deleted_at set', async () => {
    const f = await seedClientTree()
    await cascadeDeleteClient(db, f.orgId, f.clientId, {
      cascadeProjects: true, cascadeTasks: true, cascadeEntries: true
    })
    const live = await db
      .select({ id: schema.timeEntries.id })
      .from(schema.timeEntries)
      .where(and(eq(schema.timeEntries.orgId, f.orgId), isNull(schema.timeEntries.deletedAt)))
    // loose + running survive live; the three trashed ones are still rows.
    expect(live.map(r => r.id).sort()).toEqual([f.entryLoose, f.entryRunning].sort())

    const all = await db
      .select({ id: schema.timeEntries.id })
      .from(schema.timeEntries)
      .where(eq(schema.timeEntries.orgId, f.orgId))
    expect(all).toHaveLength(6)
  })
})
