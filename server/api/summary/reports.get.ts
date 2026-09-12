// GET /api/summary/reports?from&to&billable&groupBy — ReportSummary for the org.
// One SQL pass resolves the Rule 1 chain + Rule 2 rate per entry (same join
// shape as summary/dashboard's unbilled query), grouped by local day × group
// key; a second small query yields fan-out-safe totals (tag grouping counts an
// entry once per tag, totals must not). Trashed rows and the running timer are
// excluded throughout. Range is [from, to) on entry start.
import { z } from 'zod'
import type {
  ReportDay,
  ReportGroup,
  ReportSummary,
  ReportTotals
} from '#shared/types/reports'

const isoDate = z
  .string()
  .transform(s => new Date(s))
  .refine(d => Number.isFinite(d.getTime()), { message: 'Invalid date' })

const querySchema = z.object({
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

export default defineEventHandler(async (event): Promise<ReportSummary> => {
  const user = await requireAuth(event)
  const { from, to, billable, groupBy } = await getValidatedQuery(event, q => querySchema.parse(q))
  const db = useDrizzle()

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const tzLiteral = sql.raw(`'${tz.replace(/'/g, "''")}'`)

  const billableCond
    = billable === 'billable'
      ? sql` and e.billable`
      : billable === 'nonbillable'
        ? sql` and not e.billable`
        : sql``

  // Chain (Rule 1) + rate (Rule 2) resolved per entry; trashed catalog rows
  // read as detached, matching walkChain()/resolveEntryRate().
  const base = sql`
    select
      e.id,
      e.billable,
      extract(epoch from (e."end" - e.start))::float as sec,
      coalesce(e.rate_override, p.rate, c.rate, m.rate, u.default_rate) as rate,
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
    where e.org_id = ${user.orgId}
      and e.deleted_at is null
      and e."end" is not null
      and e.start >= ${from.toISOString()}::timestamptz
      and e.start < ${to.toISOString()}::timestamptz${billableCond}
  `

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

  const [groupedRes, totalsRes] = await Promise.all([groupedQ, totalsQ])
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
  const groups: ReportGroup[] = sorted.map((g, i) => ({
    ...g,
    sec: Math.round(g.sec),
    billableSec: Math.round(g.billableSec),
    amount: round2(g.amount),
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
  if (groupBy === 'tag') {
    const dayRows = unwrap<{ day: string; sec: number }>(
      await db.execute(sql`
        with b as (${base})
        select b.day, sum(b.sec)::float as sec from b group by 1
      `)
    )
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
  const totals: ReportTotals = {
    entries: t.entries,
    sec: Math.round(t.sec),
    billableSec,
    amount: round2(t.amount),
    workedDays: t.worked_days,
    avgRate: billableSec > 0 ? round2(t.amount / (billableSec / 3600)) : null
  }

  return { days, groups, totals }
})
