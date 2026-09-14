/**
 * Reports + exports (docs/content/4.reference/2.api.md §Summaries & export,
 * docs/content/3.guide/3.reports-calendar.md).
 *
 * The fixture below is small enough to total by hand:
 *
 *   default rate $50/h · client Acme $100/h · project Web $200/h · project Loose (no rate)
 *   E1  day1 09:00–11:00  2.0h  billable  → task Hero (project Web)   → $200/h → $400
 *   E2  day1 13:00–14:00  1.0h  billable  → project Loose             → $50/h  → $50
 *   E3  day2 10:00–10:30  0.5h  billable  → client Acme               → $100/h → $50
 *   E4  day2 11:00–12:00  1.0h  NON-billable, no reference            → $0
 *
 *   tracked 4.5h (16200s) · billable 3.5h (12600s) · amount $500 · 2 worked days
 *   avg $/h = 500 / 3.5 = 142.86
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  closeTestDb,
  registerAccount,
  type ApiClient,
  type TestAccount
} from '../helpers/server'

const D1 = 8 // 2026-06-08
const D2 = 9
const day = (d: number, h: number, m = 0) => new Date(2026, 5, d, h, m, 0, 0)
const iso = (d: number, h: number, m = 0) => day(d, h, m).toISOString()
const pad = (n: number) => String(n).padStart(2, '0')
const dayStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const FROM = new Date(2026, 5, D1, 0, 0, 0, 0).toISOString()
const TO = new Date(2026, 5, D2 + 1, 0, 0, 0, 0).toISOString()
const D1_STR = dayStr(day(D1, 0))
const D2_STR = dayStr(day(D2, 0))

// A separate day used only by the CSV-escaping test, so it can't skew totals.
const ESCAPE_FROM = new Date(2026, 5, 11, 0, 0, 0, 0).toISOString()
const ESCAPE_TO = new Date(2026, 5, 12, 0, 0, 0, 0).toISOString()

let acct: TestAccount
let api: ApiClient
let acme: any
let web: any
let loose: any
let hero: any
let E1: any
let E2: any
let E3: any
let E4: any

beforeAll(async () => {
  acct = await registerAccount()
  api = acct.client

  const profile = await api.patch('/api/me/profile', { defaultRate: 50 })
  expect(profile.status).toBe(200)
  expect(profile.body.defaultRate).toBe(50)

  acme = (await api.post('/api/clients', { name: 'Acme', rate: 100 })).body
  web = (await api.post('/api/projects', { name: 'Web', clientId: acme.id, rate: 200 })).body
  loose = (await api.post('/api/projects', { name: 'Loose' })).body
  hero = (await api.post('/api/tasks', { name: 'Hero', projectId: web.id })).body

  const mk = async (body: Record<string, unknown>) => {
    const res = await api.post('/api/entries', body)
    expect(res.status).toBe(200)
    return res.body
  }
  E1 = await mk({
    name: 'E1',
    refType: 'task',
    refId: hero.id,
    start: iso(D1, 9),
    end: iso(D1, 11),
    tags: ['alpha', 'beta']
  })
  E2 = await mk({
    name: 'E2',
    refType: 'project',
    refId: loose.id,
    start: iso(D1, 13),
    end: iso(D1, 14),
    tags: ['alpha']
  })
  E3 = await mk({
    name: 'E3',
    refType: 'client',
    refId: acme.id,
    start: iso(D2, 10),
    end: iso(D2, 10, 30)
  })
  E4 = await mk({
    name: 'E4',
    billable: false,
    start: iso(D2, 11),
    end: iso(D2, 12)
  })
}, 60_000)

afterAll(async () => {
  await closeTestDb()
})

describe('GET /api/summary/reports', () => {
  it('totals match the hand-computed fixture', async () => {
    const res = await api.get(`/api/summary/reports?from=${FROM}&to=${TO}&groupBy=project`)
    expect(res.status).toBe(200)
    expect(res.body.totals).toEqual({
      entries: 4,
      sec: 16200,
      billableSec: 12600,
      amount: 500,
      workedDays: 2,
      avgRate: 142.86
    })
  })

  it('groups by project with rank colors, shares and apportioned dollars', async () => {
    const res = await api.get(`/api/summary/reports?from=${FROM}&to=${TO}&groupBy=project`)
    const groups = res.body.groups as any[]
    expect(groups.map(g => g.label)).toEqual(['Web', 'No project', 'Loose'])

    expect(groups[0]).toMatchObject({
      key: web.id,
      label: 'Web',
      sub: 'Acme',
      entries: 1,
      sec: 7200,
      billableSec: 7200,
      amount: 400,
      color: 'primary',
      sharePct: 44
    })
    // E3 (client ref) and E4 (no ref) both land in the "No project" bucket.
    expect(groups[1]).toMatchObject({
      key: 'none',
      label: 'No project',
      sub: null,
      entries: 2,
      sec: 5400,
      billableSec: 1800,
      amount: 50,
      color: 'secondary-600',
      sharePct: 33
    })
    expect(groups[2]).toMatchObject({
      key: loose.id,
      label: 'Loose',
      entries: 1,
      sec: 3600,
      billableSec: 3600,
      amount: 50,
      color: 'neutral-400',
      sharePct: 22
    })

    // Non-fan-out grouping: rows add up to the printed total exactly.
    expect(groups.reduce((a, g) => a + g.amount, 0)).toBe(res.body.totals.amount)
    expect(groups.reduce((a, g) => a + g.sec, 0)).toBe(res.body.totals.sec)
  })

  it('groups by client and by task', async () => {
    const byClient = await api.get(`/api/summary/reports?from=${FROM}&to=${TO}&groupBy=client`)
    const clients = byClient.body.groups as any[]
    expect(clients.map(g => g.label).sort()).toEqual(['Acme', 'No client'])
    const acmeGroup = clients.find(g => g.label === 'Acme')
    // E1 resolves task → Web → Acme; E3 points at Acme directly.
    expect(acmeGroup).toMatchObject({ entries: 2, sec: 9000, amount: 450 })

    const byTask = await api.get(`/api/summary/reports?from=${FROM}&to=${TO}&groupBy=task`)
    const tasks = byTask.body.groups as any[]
    const heroGroup = tasks.find(g => g.key === hero.id)
    expect(heroGroup).toMatchObject({ label: 'Hero', sub: 'Web', entries: 1, sec: 7200 })
    expect(tasks.find(g => g.key === 'none')).toMatchObject({ entries: 3, sec: 9000 })
  })

  it('fills every local day of the range, zero days included, fan-out-free', async () => {
    const res = await api.get(`/api/summary/reports?from=${FROM}&to=${TO}&groupBy=project`)
    const days = res.body.days as any[]
    expect(days.map(d => d.date)).toEqual([D1_STR, D2_STR])
    expect(days[0].totalSec).toBe(10800) // E1 + E2
    expect(days[1].totalSec).toBe(5400) // E3 + E4
    // Segments are sorted largest first.
    expect(days[0].segments.map((s: any) => s.sec)).toEqual([7200, 3600])

    const wider = await api.get(
      `/api/summary/reports?from=${new Date(2026, 5, D1 - 1).toISOString()}&to=${TO}&groupBy=project`
    )
    expect(wider.body.days).toHaveLength(3)
    expect(wider.body.days[0].totalSec).toBe(0)
    expect(wider.body.days[0].segments).toEqual([])
  })

  it('tag grouping fans out: group seconds are >= the totals, days stay exact', async () => {
    const res = await api.get(`/api/summary/reports?from=${FROM}&to=${TO}&groupBy=tag`)
    expect(res.status).toBe(200)
    const groups = res.body.groups as any[]
    expect(groups.map(g => g.label).sort()).toEqual(['#alpha', '#beta', 'Untagged'])
    expect(groups.find(g => g.key === 'alpha')).toMatchObject({ entries: 2, sec: 10800 })
    expect(groups.find(g => g.key === 'beta')).toMatchObject({ entries: 1, sec: 7200 })
    expect(groups.find(g => g.key === 'untagged')).toMatchObject({ entries: 2, sec: 5400 })

    // E1 is counted under both of its tags — documented, and totals must not follow.
    const fannedOut = groups.reduce((a, g) => a + g.sec, 0)
    expect(fannedOut).toBe(23400)
    expect(fannedOut).toBeGreaterThanOrEqual(res.body.totals.sec)
    expect(res.body.totals.sec).toBe(16200)
    expect(res.body.totals.amount).toBe(500)

    // Per-day totals come from entry seconds, not the fan-out.
    const days = res.body.days as any[]
    expect(days[0].totalSec).toBe(10800)
    expect(days[1].totalSec).toBe(5400)
    expect(days[0].segments.reduce((a: number, s: any) => a + s.sec, 0)).toBeGreaterThan(
      days[0].totalSec
    )
  })

  it('tag totals for org A are untouched by a heavily tagged org B in the same range (#12)', async () => {
    // A second org with many tagged entries overlapping org A's report window —
    // proves the tag-breakdown query is scoped to org A's own entry_tags rows,
    // not incidentally correct only because the join happens to filter them out.
    const other = await registerAccount()
    const bigProject = (await other.client.post('/api/projects', { name: 'Big' })).body
    const otherTags = ['gamma', 'delta', 'epsilon']
    for (let i = 0; i < 30; i++) {
      const res = await other.client.post('/api/entries', {
        name: `other-${i}`,
        refType: 'project',
        refId: bigProject.id,
        start: iso(i % 2 === 0 ? D1 : D2, 0, (i % 24) * 30),
        end: iso(i % 2 === 0 ? D1 : D2, 0, (i % 24) * 30 + 15),
        tags: [otherTags[i % otherTags.length]!]
      })
      expect(res.status).toBe(200)
    }

    // Org A's tag-grouped totals are exactly what the fixture-only fixture
    // computed above — org B's volume of same-range tagged entries changes
    // nothing.
    const res = await api.get(`/api/summary/reports?from=${FROM}&to=${TO}&groupBy=tag`)
    expect(res.status).toBe(200)
    const groups = res.body.groups as any[]
    expect(groups.map(g => g.label).sort()).toEqual(['#alpha', '#beta', 'Untagged'])
    expect(groups.find(g => g.key === 'alpha')).toMatchObject({ entries: 2, sec: 10800 })
    expect(groups.find(g => g.key === 'beta')).toMatchObject({ entries: 1, sec: 7200 })
    expect(groups.find(g => g.key === 'untagged')).toMatchObject({ entries: 2, sec: 5400 })
    expect(res.body.totals.sec).toBe(16200)
    expect(res.body.totals.amount).toBe(500)
  }, 30_000)

  it('honours the billable filter', async () => {
    const billable = await api.get(
      `/api/summary/reports?from=${FROM}&to=${TO}&billable=billable&groupBy=project`
    )
    expect(billable.body.totals).toMatchObject({
      entries: 3,
      sec: 12600,
      billableSec: 12600,
      amount: 500
    })

    const nonbillable = await api.get(
      `/api/summary/reports?from=${FROM}&to=${TO}&billable=nonbillable&groupBy=project`
    )
    expect(nonbillable.body.totals).toMatchObject({
      entries: 1,
      sec: 3600,
      billableSec: 0,
      amount: 0,
      avgRate: null
    })
  })

  it('400s a bad range or groupBy', async () => {
    expect((await api.get('/api/summary/reports')).status).toBe(400)
    expect(
      (await api.get(`/api/summary/reports?from=${FROM}&to=${TO}&groupBy=nope`)).status
    ).toBe(400)
  })
})

describe('GET /api/export/csv', () => {
  it('serves a dated attachment with the documented header and one row per entry', async () => {
    const res = await api.get(`/api/export/csv?from=${FROM}&to=${TO}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/text\/csv/)
    expect(res.headers.get('content-disposition')).toBe(
      `attachment; filename="tick-export-${D1_STR}--${D2_STR}.csv"`
    )

    const lines = res.text.trimEnd().split('\r\n')
    expect(lines[0]).toBe(
      'date,start,end,duration_h,name,task,project,client,tags,billable,rate,amount'
    )
    expect(lines).toHaveLength(1 + 4) // header + E1..E4

    // Rows are ascending by start, so E1 is first.
    expect(lines[1]).toBe(
      `${D1_STR},09:00,11:00,2.00,E1,Hero,Web,Acme,"alpha, beta",true,200,400.00`
    )
    expect(lines[2]).toBe(`${D1_STR},13:00,14:00,1.00,E2,,Loose,,alpha,true,50,50.00`)
    expect(lines[3]).toBe(`${D2_STR},10:00,10:30,0.50,E3,,,Acme,,true,100,50.00`)
    expect(lines[4]).toBe(`${D2_STR},11:00,12:00,1.00,E4,,,,,false,50,`)
  })

  it('filters by billable and narrows the row count', async () => {
    const res = await api.get(`/api/export/csv?from=${FROM}&to=${TO}&billable=nonbillable`)
    const lines = res.text.trimEnd().split('\r\n')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain(',E4,')
  })

  it('neutralizes spreadsheet formula injection', async () => {
    const evil = await api.post('/api/entries', {
      name: '=HYPERLINK("http://evil","click")',
      start: new Date(2026, 5, 11, 9, 0, 0, 0).toISOString(),
      end: new Date(2026, 5, 11, 10, 0, 0, 0).toISOString()
    })
    expect(evil.status).toBe(200)

    const res = await api.get(`/api/export/csv?from=${ESCAPE_FROM}&to=${ESCAPE_TO}`)
    const lines = res.text.trimEnd().split('\r\n')
    expect(lines).toHaveLength(2)
    // Leading apostrophe + RFC 4180 quoting, inner quotes doubled.
    expect(lines[1]).toContain('"\'=HYPERLINK(""http://evil"",""click"")"')
    expect(lines[1]).not.toContain(',=HYPERLINK')
  })
})

describe('GET /api/export/pdf', () => {
  it('returns a real PDF attachment with the dated filename', async () => {
    const res = await api.get(`/api/export/pdf?from=${FROM}&to=${TO}&groupBy=project`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toBe(
      `attachment; filename="tick-report-${D1_STR}_${D2_STR}.pdf"`
    )

    const head = Buffer.from(res.bytes.subarray(0, 5)).toString('latin1')
    expect(head).toBe('%PDF-')
    expect(res.bytes.byteLength).toBeGreaterThan(1000)
    expect(Number(res.headers.get('content-length'))).toBe(res.bytes.byteLength)
    // Valid PDFs end with the EOF marker.
    expect(Buffer.from(res.bytes).toString('latin1')).toContain('%%EOF')
  })

  it('renders every grouping without blowing up', async () => {
    for (const groupBy of ['client', 'project', 'task', 'tag']) {
      const res = await api.get(
        `/api/export/pdf?from=${FROM}&to=${TO}&groupBy=${groupBy}`
      )
      expect(`${groupBy}:${res.status}`).toBe(`${groupBy}:200`)
      expect(Buffer.from(res.bytes.subarray(0, 5)).toString('latin1')).toBe('%PDF-')
    }
  })
})

describe('GET /api/summary/dashboard', () => {
  it('returns the documented shape', async () => {
    const res = await api.get('/api/summary/dashboard')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      todaySec: expect.any(Number),
      todayEntries: expect.any(Number),
      weekSec: expect.any(Number),
      weekBillableSec: expect.any(Number),
      unbilledAmount: expect.any(Number),
      unbilledClients: expect.any(Number),
      billablePct: expect.any(Number)
    })
    expect(res.body.activity).toHaveLength(16 * 5) // 16 weeks × Mon–Fri
    expect(res.body.weekDays).toHaveLength(7)
  })
})
