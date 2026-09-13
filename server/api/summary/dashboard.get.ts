// GET /api/summary/dashboard — DashboardSummary for the session user.
// Two aggregate queries: (a) per-day seconds over the 16-week activity window,
// (b) all-time unbilled amount with the Rule 2 rate chain resolved in SQL.
// Excludes trashed rows and the running timer throughout.

const pad = (n: number) => String(n).padStart(2, '0')
const fmtDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
/** Monday 00:00 of the week containing d (local time). */
const startOfWeek = (d: Date) => {
  const x = startOfDay(d)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}
const addDays = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
const round2 = (n: number) => Math.round(n * 100) / 100

interface DayRow {
  day: string
  sec: number
  billable_sec: number
  entries: number
}

export default defineEventHandler(async (event): Promise<DashboardSummary> => {
  const user = await requireAuth(event)
  const db = useDrizzle()

  const now = new Date()
  const weekStart = startOfWeek(now)
  const rangeStart = addDays(weekStart, -15 * 7) // 16 Mon-Fri columns, current week last
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

  const e = schema.timeEntries
  // tz must be inlined (not a bind param): the same fragment is used in SELECT and
  // GROUP BY, and two separate $n params make Postgres reject the grouping.
  const tzLiteral = sql.raw(`'${tz.replace(/'/g, "''")}'`)
  const dayExpr = sql<string>`to_char(${e.start} at time zone ${tzLiteral}, 'YYYY-MM-DD')`
  const dayRowsQ = db
    .select({
      day: dayExpr,
      sec: sql<number>`sum(extract(epoch from (${e.end} - ${e.start})))::float`,
      billable_sec: sql<number>`sum(case when ${e.billable} then extract(epoch from (${e.end} - ${e.start})) else 0 end)::float`,
      entries: sql<number>`count(*)::int`
    })
    .from(e)
    .where(
      and(
        eq(e.orgId, user.orgId),
        eq(e.userId, user.id),
        isNull(e.deletedAt),
        isNotNull(e.end),
        gte(e.start, rangeStart)
      )
    )
    .groupBy(dayExpr)

  // Unbilled = sum of billable entry amounts, rate per Rule 2:
  // rate_override → task.rate → project.rate → client.rate → org_member.rate → user.default_rate,
  // chain walked from the deepest ref (Rule 1), trashed catalog rows excluded.
  const unbilledQ = db.execute(sql`
    select
      coalesce(sum(
        extract(epoch from (e."end" - e.start)) / 3600.0
        * coalesce(e.rate_override, t.rate, p.rate, c.rate, m.rate, u.default_rate)
      ), 0)::float as amount,
      count(distinct c.id)::int as clients
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
      and e.user_id = ${user.id}
      and e.deleted_at is null
      and e."end" is not null
      and e.billable
  `)

  const [dayRows, unbilledRes] = await Promise.all([dayRowsQ, unbilledQ])
  const unbilledRows = (Array.isArray(unbilledRes) ? unbilledRes : (unbilledRes as { rows: unknown[] }).rows) as {
    amount: number
    clients: number
  }[]
  const unbilled = unbilledRows[0] ?? { amount: 0, clients: 0 }

  const byDay = new Map<string, DayRow>((dayRows as DayRow[]).map(r => [r.day, r]))
  const dayOf = (d: Date) => byDay.get(fmtDay(d))

  const today = dayOf(now)

  // Current week Mon–Sun, billable / non-billable split.
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i)
    const row = dayOf(date)
    const sec = Math.round(row?.sec ?? 0)
    const billableSec = Math.round(row?.billable_sec ?? 0)
    return { date: fmtDay(date), billableSec, nonBillableSec: Math.max(0, sec - billableSec) }
  })
  const weekSec = weekDays.reduce((a, d) => a + d.billableSec + d.nonBillableSec, 0)
  const weekBillableSec = weekDays.reduce((a, d) => a + d.billableSec, 0)

  // 16 weeks × Mon–Fri, oldest week first.
  const activity: DashboardSummary['activity'] = []
  for (let w = 0; w < 16; w++) {
    for (let i = 0; i < 5; i++) {
      const date = addDays(rangeStart, w * 7 + i)
      activity.push({ date: fmtDay(date), hours: round2((dayOf(date)?.sec ?? 0) / 3600) })
    }
  }

  return {
    todaySec: Math.round(today?.sec ?? 0),
    todayEntries: today?.entries ?? 0,
    weekSec,
    weekBillableSec,
    unbilledAmount: round2(unbilled.amount),
    unbilledClients: unbilled.clients,
    activity,
    weekDays,
    billablePct: weekSec > 0 ? Math.round((weekBillableSec / weekSec) * 100) : 0
  }
})
