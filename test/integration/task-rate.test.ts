/**
 * Per-task rate (Tick#16) — the new rung between entry.rate_override and
 * project.rate: entry.rate_override → task.rate → project.rate → client.rate
 * → org_member.rate → user.default_rate.
 *
 * Rates resolve in three places that must agree (server/utils/rates.ts in
 * JavaScript; server/utils/pdf/report-data.ts and
 * server/api/summary/dashboard.get.ts in raw SQL) — this is the agreement
 * test the issue calls for: the entry DTO amount, the reports total, the CSV
 * amount and the dashboard unbilled figure must all land on the exact same
 * number for the exact same entries, or they'd quietly drift apart.
 *
 * Fixture (durations chosen for exact cents):
 *
 *   default rate $50/h (user) · client Acme $100/h · project Web $200/h
 *   task A (own rate $300/h, under Web) · task B (no rate, under Web, inherits Web)
 *   task C (standalone, own rate $60/h, no project)
 *
 *   EA  09:00–10:00  1.0h  → task A                    → $300/h (task)    → $300.00
 *   EB  10:00–12:00  2.0h  → task B                    → $200/h (project) → $400.00
 *   EC  12:00–12:30  0.5h  → task C                    → $60/h  (task)    → $30.00
 *   EP  13:00–14:30  1.5h  → project Web directly      → $200/h (project) → $300.00
 *   EO  15:00–16:00  1.0h  → task A, rateOverride $500 → $500/h (override)→ $500.00
 *
 *   tracked 6.0h (21600s), all billable · total amount $1530.00 · avg $/h 255.00
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  closeTestDb,
  registerAccount,
  type ApiClient,
  type TestAccount
} from '../helpers/server'

const D = 1 // 2026-08-01
const day = (h: number, m = 0) => new Date(2026, 7, D, h, m, 0, 0)
const iso = (h: number, m = 0) => day(h, m).toISOString()
const FROM = new Date(2026, 7, D, 0, 0, 0, 0).toISOString()
const TO = new Date(2026, 7, D + 1, 0, 0, 0, 0).toISOString()
const D_STR = '2026-08-01'

let acct: TestAccount
let api: ApiClient
let acme: any
let web: any
let taskA: any
let taskB: any
let taskC: any
let EA: any
let EB: any
let EC: any
let EP: any
let EO: any

beforeAll(async () => {
  acct = await registerAccount()
  api = acct.client

  const profile = await api.patch('/api/me/profile', { defaultRate: 50 })
  expect(profile.status).toBe(200)
  expect(profile.body.defaultRate).toBe(50)

  acme = (await api.post('/api/clients', { name: 'Acme', rate: 100 })).body
  web = (await api.post('/api/projects', { name: 'Web', clientId: acme.id, rate: 200 })).body
  taskA = (await api.post('/api/tasks', { name: 'Task A', projectId: web.id, rate: 300 })).body
  taskB = (await api.post('/api/tasks', { name: 'Task B', projectId: web.id })).body
  taskC = (await api.post('/api/tasks', { name: 'Task C', rate: 60 })).body

  expect(taskA.rate).toBe(300)
  expect(taskB.rate).toBeNull()
  expect(taskC.rate).toBe(60)

  const mk = async (body: Record<string, unknown>) => {
    const res = await api.post('/api/entries', body)
    expect(res.status).toBe(200)
    return res.body
  }
  EA = await mk({ name: 'EA', refType: 'task', refId: taskA.id, start: iso(9), end: iso(10) })
  EB = await mk({ name: 'EB', refType: 'task', refId: taskB.id, start: iso(10), end: iso(12) })
  EC = await mk({ name: 'EC', refType: 'task', refId: taskC.id, start: iso(12), end: iso(12, 30) })
  EP = await mk({ name: 'EP', refType: 'project', refId: web.id, start: iso(13), end: iso(14, 30) })
  EO = await mk({
    name: 'EO',
    refType: 'task',
    refId: taskA.id,
    rateOverride: 500,
    start: iso(15),
    end: iso(16)
  })
}, 60_000)

afterAll(async () => {
  await closeTestDb()
})

/** Expected {resolvedRate, rateOverridden, amount} per entry name, before the task A rate is cleared. */
const EXPECTED_BEFORE: Record<string, { resolvedRate: number, rateOverridden: boolean, amount: number }> = {
  EA: { resolvedRate: 300, rateOverridden: false, amount: 300 },
  EB: { resolvedRate: 200, rateOverridden: false, amount: 400 },
  EC: { resolvedRate: 60, rateOverridden: false, amount: 30 },
  EP: { resolvedRate: 200, rateOverridden: false, amount: 300 },
  EO: { resolvedRate: 500, rateOverridden: true, amount: 500 }
}
const TOTAL_BEFORE = 1530

async function fetchEntries(): Promise<Record<string, any>> {
  const res = await api.get(`/api/entries?from=${FROM}&to=${TO}`)
  expect(res.status).toBe(200)
  const byName: Record<string, any> = {}
  for (const dto of res.body as any[]) byName[dto.name] = dto
  return byName
}

describe('entry DTOs — task rate wins over project, override still wins over task', () => {
  it('resolves every entry at the expected rate and amount', async () => {
    const byName = await fetchEntries()
    for (const [name, expected] of Object.entries(EXPECTED_BEFORE)) {
      expect(byName[name], `entry ${name}`).toMatchObject({
        resolvedRate: expected.resolvedRate,
        rateOverridden: expected.rateOverridden,
        amount: expected.amount
      })
    }
  })
})

describe('GET /api/tasks — rate, resolvedRate and rateSource', () => {
  it('exposes the task’s own rate and where it resolves from', async () => {
    const res = await api.get('/api/tasks')
    expect(res.status).toBe(200)
    const byId = new Map((res.body as any[]).map(t => [t.id, t]))

    expect(byId.get(taskA.id)).toMatchObject({ rate: 300, resolvedRate: 300, rateSource: 'task' })
    expect(byId.get(taskB.id)).toMatchObject({ rate: null, resolvedRate: 200, rateSource: 'project' })
    expect(byId.get(taskC.id)).toMatchObject({ rate: 60, resolvedRate: 60, rateSource: 'task' })
  })
})

describe('reports, CSV and dashboard agree with the entry DTOs', () => {
  it('reports summary total equals the sum of the entry DTO amounts', async () => {
    const res = await api.get(`/api/summary/reports?from=${FROM}&to=${TO}&groupBy=project`)
    expect(res.status).toBe(200)
    expect(res.body.totals.sec).toBe(21600)
    expect(res.body.totals.billableSec).toBe(21600)
    expect(res.body.totals.amount).toBe(TOTAL_BEFORE)
    expect(res.body.totals.avgRate).toBe(255)

    const byName = await fetchEntries()
    const summedFromEntries = Object.keys(EXPECTED_BEFORE)
      .reduce((sum, name) => sum + (byName[name].amount ?? 0), 0)
    expect(res.body.totals.amount).toBe(summedFromEntries)
  })

  it('CSV export amounts equal the entry DTO amounts, row for row', async () => {
    const byName = await fetchEntries()
    const res = await api.get(`/api/export/csv?from=${FROM}&to=${TO}`)
    expect(res.status).toBe(200)
    const lines = res.text.trimEnd().split('\r\n')
    expect(lines[0]).toBe(
      'date,start,end,duration_h,name,task,project,client,tags,billable,rate,amount'
    )
    // Ascending by start: EA, EB, EC, EP, EO.
    const rowsByName = new Map<string, string[]>()
    for (const line of lines.slice(1)) {
      const cols = line.split(',')
      rowsByName.set(cols[4]!, cols)
    }
    for (const name of Object.keys(EXPECTED_BEFORE)) {
      const cols = rowsByName.get(name)!
      const dto = byName[name]
      expect(Number(cols[10]), `${name} rate column`).toBe(dto.resolvedRate)
      expect(Number(cols[11]), `${name} amount column`).toBeCloseTo(dto.amount, 2)
    }
    expect(rowsByName.get('EA')).toEqual([D_STR, '09:00', '10:00', '1.00', 'EA', 'Task A', 'Web', 'Acme', '', 'true', '300', '300.00'])
  })

  it('dashboard unbilled amount equals the sum of this user’s billable amounts', async () => {
    const byName = await fetchEntries()
    const expectedUnbilled = Object.values(byName).reduce(
      (sum: number, dto: any) => sum + (dto.billable ? (dto.amount ?? 0) : 0),
      0
    )
    expect(expectedUnbilled).toBe(TOTAL_BEFORE)

    const res = await api.get('/api/summary/dashboard')
    expect(res.status).toBe(200)
    expect(res.body.unbilledAmount).toBe(expectedUnbilled)
  })
})

describe('clearing a task’s rate falls back to the project rate everywhere', () => {
  it('PATCH task A rate:null → task DTO, entry DTOs and the report all fall back to the project rate', async () => {
    const patch = await api.patch(`/api/tasks/${taskA.id}`, { rate: null })
    expect(patch.status).toBe(200)
    expect(patch.body).toMatchObject({ rate: null, resolvedRate: 200, rateSource: 'project' })

    const byName = await fetchEntries()
    // EA had no override — it now inherits Web's project rate.
    expect(byName.EA).toMatchObject({ resolvedRate: 200, rateOverridden: false, amount: 200 })
    // EO's entry-level override still beats everything below it.
    expect(byName.EO).toMatchObject({ resolvedRate: 500, rateOverridden: true, amount: 500 })

    const report = await api.get(`/api/summary/reports?from=${FROM}&to=${TO}&groupBy=project`)
    expect(report.status).toBe(200)
    // 200 (EA) + 400 (EB) + 30 (EC) + 300 (EP) + 500 (EO) = 1430
    expect(report.body.totals.amount).toBe(1430)

    // Restore task A's rate so later tests in this file see the original fixture.
    const restore = await api.patch(`/api/tasks/${taskA.id}`, { rate: 300 })
    expect(restore.status).toBe(200)
    expect(restore.body).toMatchObject({ rate: 300, resolvedRate: 300, rateSource: 'task' })
  })
})

describe('validation and tenancy', () => {
  it('POST /api/tasks rejects a negative rate with 400', async () => {
    const res = await api.post('/api/tasks', { name: 'Bad rate task', rate: -5 })
    expect(res.status).toBe(400)
  })

  it('PATCH /api/tasks/:id rejects a negative rate with 400', async () => {
    const res = await api.patch(`/api/tasks/${taskC.id}`, { rate: -1 })
    expect(res.status).toBe(400)
    // Unchanged.
    const tasks = await api.get('/api/tasks')
    const c = (tasks.body as any[]).find(t => t.id === taskC.id)
    expect(c.rate).toBe(60)
  })

  it('a cross-org task PATCH is 404, not a leak', async () => {
    const other = await registerAccount()
    const res = await other.client.patch(`/api/tasks/${taskA.id}`, { rate: 999 })
    expect(res.status).toBe(404)
    // A's task is untouched.
    const tasks = await api.get('/api/tasks')
    const a = (tasks.body as any[]).find(t => t.id === taskA.id)
    expect(a.rate).toBe(300)
  })
})
