// Shared report aggregation — the single source for ReportSummary, imported by
// both GET /api/summary/reports (JSON) and GET /api/export/pdf (PDF render).
// One SQL pass resolves the Rule 1 chain + Rule 2 rate per entry (same join
// shape as summary/dashboard's unbilled query), grouped by local day × group
// key; a second small query yields fan-out-safe totals (tag grouping counts an
// entry once per tag, totals must not). Trashed rows and the running timer are
// excluded throughout. Range is [from, to) on entry start.
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import type { DB } from '../drizzle'
import type {
  ReportBillFilter,
  ReportDay,
  ReportGroup,
  ReportGroupBy,
  ReportSummary,
  ReportTotals
} from '#shared/types/reports'

const isoDate = z
  .string()
  .transform(s => new Date(s))
  .refine(d => Number.isFinite(d.getTime()), { message: 'Invalid date' })

/** Query shape shared by /api/summary/reports and /api/export/pdf. */
export const reportQuerySchema = z.object({
  from: isoDate,
  to: isoDate,
  billable: z.enum(['all', 'billable', 'nonbillable']).default('all'),
  groupBy: z.enum(['client', 'project', 'task', 'tag']).default('project')
})

/** Series palette by rank (README §Reports): accent, accent-2-600, neutral-400, accent-800, neutral-600. */
const SERIES = ['primary', 'secondary-600', 'neutral-400', 'primary-800', 'neutral-600'] as const

const pad = (n: number) => String(n).padStart(2, '0')
const fmtDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Money rounding at the DTO boundary: report amounts are whole dollars, and a
 * row set is rounded by largest remainder so the rows add up to the rounded
 * grand total (no "$88 + $88 = $175" mismatch between a table and its Total).
 * Every consumer — the page, the PDF, the stat cards — then agrees, because
 * they all format the same integers.
 */
function apportionDollars(values: number[]): number[] {
  const target = Math.round(values.reduce((a, v) => a + v, 0))
  const floors = values.map(v => Math.floor(v))
  let rest = target - floors.reduce((a, v) => a + v, 0)
  // Hand the leftover dollars to the largest fractional parts, biggest first.
  const order = values
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)
  for (const { i } of order) {
    if (rest <= 0) break
    floors[i]! += 1
    rest -= 1
  }
  return floors
}

interface GroupRow {
  day: string
  key: string
  label: string | null
  sub: string | null
  entries: number
  sec: number
  billable_sec: number
  amount: number
}

interface TotalsRow {
  entries: number
  sec: number
  billable_sec: number
  amount: number
  worked_days: number
}

const unwrap = <T>(res: unknown): T[] =>
  (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as T[]

export interface ReportParams {
  from: Date
  to: Date
  billable: ReportBillFilter
  groupBy: ReportGroupBy
}

/**
 * Base CTE shared by every report query: chain (Rule 1) + rate (Rule 2)
 * resolved per entry — entry.rate_override → task.rate → project.rate →
 * client.rate → org_member.rate → user.default_rate; trashed catalog rows
 * read as detached, matching walkChain()/resolveEntryRate().
 */
function baseEntriesSql(orgId: string, from: Date, to: Date, billable: ReportBillFilter) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const tzLiteral = sql.raw(`'${tz.replace(/'/g, "''")}'`)

  const billableCond
    = billable === 'billable'
      ? sql` and e.billable`
      : billable === 'nonbillable'
        ? sql` and not e.billable`
        : sql``

  return sql`
    select
      e.id,
      e.billable,
      extract(epoch from (e."end" - e.start))::float as sec,
      coalesce(e.rate_override, t.rate, p.rate, c.rate, m.rate, u.default_rate) as rate,
      t.id as task_id, t.name as task_name,
      p.id as project_id, p.name as project_name,
      c.id as client_id, c.name as client_name,
      to_char(e.start at time zone ${tzLiteral}, 'YYYY-MM-DD') as day
    from time_entries e
    left join tasks t
      on e.ref_type = 'task' and t.id = e.ref_id and t.deleted_at is null
    left join projects p
      on p.deleted_at is null
      and p.id = case when e.ref_type = 'project' then e.ref_id else t.project_id end
    left join clients c
      on c.deleted_at is null
      and c.id = case when e.ref_type = 'client' then e.ref_id else p.client_id end
    left join org_members m on m.org_id = e.org_id and m.user_id = e.user_id
    left join users u on u.id = e.user_id
    where e.org_id = ${orgId}
      and e.deleted_at is null
      and e."end" is not null
      and e.start >= ${from.toISOString()}::timestamptz
      and e.start < ${to.toISOString()}::timestamptz${billableCond}
  `
}

export async function buildReportSummary(
  db: DB,
  orgId: string,
  { from, to, billable, groupBy }: ReportParams
): Promise<ReportSummary> {
  const base = baseEntriesSql(orgId, from, to, billable)

  // key/label/sub per grouping. "none" buckets keep sub null so they stay one row.
  const keyed
    = groupBy === 'client'
      ? sql.raw(`
        coalesce(b.client_id::text, 'none') as key,
        coalesce(b.client_name, 'No client') as label,
        null::text as sub`)
      : groupBy === 'project'
        ? sql.raw(`
        coalesce(b.project_id::text, 'none') as key,
        coalesce(b.project_name, 'No project') as label,
        case when b.project_id is null then null else b.client_name end as sub`)
        : groupBy === 'task'
          ? sql.raw(`
        coalesce(b.task_id::text, 'none') as key,
        coalesce(b.task_name, 'No task') as label,
        case when b.task_id is null then null else b.project_name end as sub`)
          : sql.raw(`
        coalesce(tg.name, 'untagged') as key,
        null::text as label,
        null::text as sub`)

  // Tag grouping fans an entry out to each of its live tags ("Untagged" when none).
  const tagJoin
    = groupBy === 'tag'
      ? sql.raw(`
        left join (
          select et.entry_id, g.name
          from entry_tags et
          join tags g on g.id = et.tag_id and g.deleted_at is null
        ) tg on tg.entry_id = b.id`)
      : sql.raw('')

  const groupedQ = db.execute(sql`
    with b as (${base})
    select b.day, ${keyed},
      count(distinct b.id)::int as entries,
      sum(b.sec)::float as sec,
      sum(case when b.billable then b.sec else 0 end)::float as billable_sec,
      sum(case when b.billable and b.rate is not null then b.sec / 3600.0 * b.rate else 0 end)::float as amount
    from b${tagJoin}
    group by 1, 2, 3, 4
  `)

  const totalsQ = db.execute(sql`
    with b as (${base})
    select
      count(*)::int as entries,
      coalesce(sum(b.sec), 0)::float as sec,
      coalesce(sum(case when b.billable then b.sec else 0 end), 0)::float as billable_sec,
      coalesce(sum(case when b.billable and b.rate is not null then b.sec / 3600.0 * b.rate else 0 end), 0)::float as amount,
      count(distinct b.day)::int as worked_days
    from b
  `)

  // Tag grouping: day totals must come from entry seconds, not the tag
  // fan-out — a third fan-out-free query, run alongside the other two.
  const tagDaysQ = groupBy === 'tag'
    ? db.execute(sql`
        with b as (${base})
        select b.day, sum(b.sec)::float as sec from b group by 1
      `)
    : null

  const [groupedRes, totalsRes, tagDaysRes] = await Promise.all([groupedQ, totalsQ, tagDaysQ])
  const rows = unwrap<GroupRow>(groupedRes)
  const t = unwrap<TotalsRow>(totalsRes)[0] ?? {
    entries: 0,
    sec: 0,
    billable_sec: 0,
    amount: 0,
    worked_days: 0
  }

  // ── Groups: aggregate day×key rows, sort by tracked desc, rank → color ────
  const byKey = new Map<string, Omit<ReportGroup, 'color' | 'sharePct'>>()
  for (const r of rows) {
    const label = r.label ?? (r.key === 'untagged' ? 'Untagged' : `#${r.key}`)
    let g = byKey.get(r.key)
    if (!g) {
      g = { key: r.key, label, sub: r.sub, entries: 0, sec: 0, billableSec: 0, amount: 0 }
      byKey.set(r.key, g)
    }
    g.entries += r.entries
    g.sec += r.sec
    g.billableSec += r.billable_sec
    g.amount += r.amount
  }
  const sorted = [...byKey.values()].sort((a, b) => b.sec - a.sec)
  // Whole-dollar amounts that add up to the rounded group total (see
  // apportionDollars). Tag grouping fans an entry out per tag, so its group
  // sum legitimately exceeds ReportTotals.amount — it is apportioned against
  // its own sum, which is what the table's rows show.
  const groupAmounts = apportionDollars(sorted.map(g => g.amount))
  const groups: ReportGroup[] = sorted.map((g, i) => ({
    ...g,
    sec: Math.round(g.sec),
    billableSec: Math.round(g.billableSec),
    amount: groupAmounts[i]!,
    color: SERIES[Math.min(i, SERIES.length - 1)]!,
    sharePct: t.sec > 0 ? Math.round((g.sec / t.sec) * 100) : 0
  }))

  // ── Days: every local day of [from, to), zero days included ───────────────
  const segsByDay = new Map<string, { key: string; label: string; sec: number }[]>()
  const totalByDay = new Map<string, number>()
  for (const r of rows) {
    const label = r.label ?? (r.key === 'untagged' ? 'Untagged' : `#${r.key}`)
    const list = segsByDay.get(r.day) ?? []
    list.push({ key: r.key, label, sec: Math.round(r.sec) })
    segsByDay.set(r.day, list)
  }
  // Day totals must come from entry seconds, not the tag fan-out.
  if (tagDaysRes) {
    const dayRows = unwrap<{ day: string; sec: number }>(tagDaysRes)
    for (const r of dayRows) totalByDay.set(r.day, Math.round(r.sec))
  } else {
    for (const [day, segs] of segsByDay) {
      totalByDay.set(day, segs.reduce((a, s) => a + s.sec, 0))
    }
  }

  const days: ReportDay[] = []
  for (
    let d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    d < to;
    d.setDate(d.getDate() + 1)
  ) {
    const date = fmtDay(d)
    const segments = (segsByDay.get(date) ?? []).sort((a, b) => b.sec - a.sec)
    days.push({ date, totalSec: totalByDay.get(date) ?? 0, segments })
  }

  const billableSec = Math.round(t.billable_sec)
  const totalAmount = Math.round(t.amount)
  const totals: ReportTotals = {
    entries: t.entries,
    sec: Math.round(t.sec),
    billableSec,
    // Whole dollars, equal to the sum of the rounded rows (non-tag groupings)
    // and to the sum of the rounded per-day amounts.
    amount: totalAmount,
    workedDays: t.worked_days,
    // avgRate derives from the displayed total so "avg $/h" can't contradict it
    avgRate: billableSec > 0 ? round2(totalAmount / (billableSec / 3600)) : null
  }

  return { days, groups, totals }
}

/** One row per local day of [from, to) — zero days included. */
export interface ReportDayTotal {
  /** Local calendar day, YYYY-MM-DD */
  date: string
  sec: number
  billableSec: number
  amount: number
}

/**
 * Per-day totals for the PDF's hours-by-day table. ReportSummary.days carries
 * only chart segments (no per-day billable/amount), and the tag fan-out makes
 * summing groups per day wrong — so this runs one fan-out-free query over the
 * same base CTE.
 */
export async function buildReportDayTotals(
  db: DB,
  orgId: string,
  { from, to, billable }: Omit<ReportParams, 'groupBy'>
): Promise<ReportDayTotal[]> {
  const base = baseEntriesSql(orgId, from, to, billable)
  const rows = unwrap<{ day: string, sec: number, billable_sec: number, amount: number }>(
    await db.execute(sql`
      with b as (${base})
      select b.day,
        sum(b.sec)::float as sec,
        sum(case when b.billable then b.sec else 0 end)::float as billable_sec,
        sum(case when b.billable and b.rate is not null then b.sec / 3600.0 * b.rate else 0 end)::float as amount
      from b
      group by 1
    `)
  )
  const byDay = new Map(rows.map(r => [r.day, r]))

  const out: ReportDayTotal[] = []
  for (
    let d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    d < to;
    d.setDate(d.getDate() + 1)
  ) {
    const date = fmtDay(d)
    const r = byDay.get(date)
    out.push({
      date,
      sec: Math.round(r?.sec ?? 0),
      billableSec: Math.round(r?.billable_sec ?? 0),
      amount: r?.amount ?? 0
    })
  }
  // Whole dollars adding up to the same rounded total the PDF's Total row
  // prints (ReportTotals.amount) — the day table can't disagree with itself.
  const dayAmounts = apportionDollars(out.map(o => o.amount))
  out.forEach((o, i) => (o.amount = dayAmounts[i]!))
  return out
}
