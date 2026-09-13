/**
 * Timer contracts (CONTRACTS.md §Timer, docs/content/3.guide/1.timer-and-entries.md):
 * one running row per user (partial unique index), 409 on a double start,
 * PATCH edits the running row, stop persists — except under one second, which
 * is treated as an accidental tap and hard-deleted.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq, isNull } from 'drizzle-orm'
import {
  closeTestDb,
  registerAccount,
  schema,
  sleep,
  testDb,
  type ApiClient,
  type TestAccount
} from '../helpers/server'

let acct: TestAccount
let api: ApiClient
let client: any
let project: any
let task: any
let quietProject: any
let quietTask: any

beforeAll(async () => {
  acct = await registerAccount()
  api = acct.client
  client = (await api.post('/api/clients', { name: 'Timer Client', rate: 100 })).body
  project = (
    await api.post('/api/projects', { name: 'Timer Project', clientId: client.id, rate: 150 })
  ).body
  task = (await api.post('/api/tasks', { name: 'Timer Task', projectId: project.id })).body
  quietProject = (
    await api.post('/api/projects', { name: 'Non-billable Project', billableDefault: false })
  ).body
  quietTask = (
    await api.post('/api/tasks', { name: 'Quiet Task', projectId: quietProject.id })
  ).body
}, 60_000)

afterAll(async () => {
  await api.post('/api/timer/stop')
  await closeTestDb()
})

/** Running (end IS NULL, not trashed) rows for this user, straight from the DB. */
async function runningRows() {
  return testDb()
    .select()
    .from(schema.timeEntries)
    .where(
      and(
        eq(schema.timeEntries.userId, acct.user.id),
        isNull(schema.timeEntries.end),
        isNull(schema.timeEntries.deletedAt)
      )
    )
}

async function stopIfRunning() {
  await api.post('/api/timer/stop')
}

describe('GET /api/timer', () => {
  it('is empty when nothing runs', async () => {
    await stopIfRunning()
    const res = await api.get('/api/timer')
    expect([200, 204]).toContain(res.status)
    expect(res.body).toBeNull()
  })
})

describe('start → 409 → patch → stop', () => {
  it('start returns a TimerState and a second start is 409', async () => {
    await stopIfRunning()
    const started = await api.post('/api/timer/start', {
      name: 'Writing tests',
      refType: 'task',
      refId: task.id
    })
    expect(started.status).toBe(200)
    expect(started.body).toMatchObject({
      name: 'Writing tests',
      billable: true,
      resolvedRate: 150 // project rate wins over client rate (Rule 2)
    })
    expect(started.body.entryId).toMatch(/^[0-9a-f-]{36}$/)
    expect(started.body.ref).toMatchObject({
      refType: 'task',
      refId: task.id,
      taskName: 'Timer Task',
      projectName: 'Timer Project',
      clientName: 'Timer Client'
    })
    expect(Number.isFinite(Date.parse(started.body.start))).toBe(true)

    // Exactly one running row exists for this user.
    expect(await runningRows()).toHaveLength(1)

    const second = await api.post('/api/timer/start', { name: 'Second' })
    expect(second.status).toBe(409)
    expect(second.body.message).toMatch(/already running/i)
    expect(await runningRows()).toHaveLength(1)

    // GET reflects the same running row.
    const get = await api.get('/api/timer')
    expect(get.status).toBe(200)
    expect(get.body.entryId).toBe(started.body.entryId)

    await stopIfRunning()
  })

  it('PATCH renames, retargets, detaches and toggles billable', async () => {
    await stopIfRunning()
    const started = await api.post('/api/timer/start', { name: 'before' })
    expect(started.status).toBe(200)

    const renamed = await api.patch('/api/timer', { name: 'after', billable: false })
    expect(renamed.status).toBe(200)
    expect(renamed.body).toMatchObject({ name: 'after', billable: false })
    expect(renamed.body.entryId).toBe(started.body.entryId)

    const attached = await api.patch('/api/timer', { refType: 'project', refId: project.id })
    expect(attached.status).toBe(200)
    expect(attached.body.ref).toMatchObject({ refType: 'project', refId: project.id })
    expect(attached.body.resolvedRate).toBe(150)

    const detached = await api.patch('/api/timer', { refType: null, refId: null })
    expect(detached.status).toBe(200)
    expect(detached.body.ref).toBeNull()

    const bogus = await api.patch('/api/timer', {
      refType: 'project',
      refId: '00000000-0000-4000-8000-000000000000'
    })
    expect(bogus.status).toBe(400)

    await stopIfRunning()
  })

  it('stop persists the entry with a real end', async () => {
    await stopIfRunning()
    const started = await api.post('/api/timer/start', {
      name: 'Persisted run',
      refType: 'task',
      refId: task.id
    })
    expect(started.status).toBe(200)
    await sleep(1200)

    const stopped = await api.post('/api/timer/stop')
    expect(stopped.status).toBe(200)
    expect(stopped.body.id).toBe(started.body.entryId)
    expect(stopped.body.end).not.toBeNull()
    expect(stopped.body.durationSec).toBeGreaterThanOrEqual(1)
    expect(stopped.body.name).toBe('Persisted run')
    expect(stopped.body.resolvedRate).toBe(150)
    // amount is rounded to cents at the DTO boundary (round2 in entry-dto.ts).
    expect(stopped.body.amount).toBe(
      Math.round((stopped.body.durationSec / 3600) * 150 * 100) / 100
    )

    // The row really is in the database, ended, not trashed.
    const [row] = await testDb()
      .select()
      .from(schema.timeEntries)
      .where(eq(schema.timeEntries.id, started.body.entryId))
    expect(row).toBeTruthy()
    expect(row!.end).not.toBeNull()
    expect(row!.deletedAt).toBeNull()
    expect(row!.end!.getTime()).toBeGreaterThan(row!.start.getTime())
    expect(await runningRows()).toHaveLength(0)
  })

  it('404s PATCH and stop when nothing is running', async () => {
    await stopIfRunning()
    expect((await api.patch('/api/timer', { name: 'nope' })).status).toBe(404)
    expect((await api.post('/api/timer/stop')).status).toBe(404)
  })
})

describe('sub-second stop', () => {
  it('discards the row and returns null', async () => {
    await stopIfRunning()
    const started = await api.post('/api/timer/start', { name: 'Accidental tap' })
    expect(started.status).toBe(200)
    const id = started.body.entryId

    const stopped = await api.post('/api/timer/stop')
    expect([200, 204]).toContain(stopped.status)
    expect(stopped.body).toBeNull()

    // Hard-deleted: not trashed, simply gone.
    const rows = await testDb()
      .select()
      .from(schema.timeEntries)
      .where(eq(schema.timeEntries.id, id))
    expect(rows).toHaveLength(0)
    expect(await runningRows()).toHaveLength(0)
  })
})

describe('one-running-per-user index', () => {
  it('holds under two rapid starts: exactly one wins, one 409s', async () => {
    await stopIfRunning()
    const [first, second] = await Promise.all([
      api.post('/api/timer/start', { name: 'race A' }),
      api.post('/api/timer/start', { name: 'race B' })
    ])
    const statuses = [first.status, second.status].sort()
    expect(statuses).toEqual([200, 409])
    expect(await runningRows()).toHaveLength(1)
    await stopIfRunning()
  })

  it('five simultaneous starts still leave exactly one running row', async () => {
    await stopIfRunning()
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => api.post('/api/timer/start', { name: `race ${i}` }))
    )
    expect(results.filter(r => r.status === 200)).toHaveLength(1)
    expect(results.filter(r => r.status === 409)).toHaveLength(4)
    expect(await runningRows()).toHaveLength(1)
    await stopIfRunning()
  })
})

describe('billable default (Rule 2)', () => {
  it("inherits the project's billable_default when the caller does not say", async () => {
    await stopIfRunning()
    const quiet = await api.post('/api/timer/start', {
      refType: 'task',
      refId: quietTask.id
    })
    expect(quiet.status).toBe(200)
    expect(quiet.body.billable).toBe(false)
    await stopIfRunning()

    const explicit = await api.post('/api/timer/start', {
      refType: 'task',
      refId: quietTask.id,
      billable: true
    })
    expect(explicit.status).toBe(200)
    expect(explicit.body.billable).toBe(true)
    await stopIfRunning()
  })
})
