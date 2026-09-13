// DTO builders: entries/timer (chain derivation per Rule 1), catalog DTOs with
// tracked/amount aggregates, deterministic client colors, tag helpers.
import { and, eq, inArray, inUuids, isNotNull, isNull, schema, sql } from './drizzle'
import type { DB } from './drizzle'
import { pickRate, resolveEntryRate, walkChain } from './rates'
import type { RateContext } from './rates'

/* ------------------------------------------------------------------ colors */

// README §Clients palette: accent-400 / accent-2-600 / neutral-400 / accent-600.
// Stored as semantic token names; the UI maps them to classes (accent = primary,
// accent-2 = secondary in Nuxt UI terms). Never hex.
export const CLIENT_COLOR_PALETTE = [
  'primary-400',
  'secondary-600',
  'neutral-400',
  'primary-600'
] as const

/** Deterministic palette pick from the client id (FNV-1a hash). */
export function clientColor(id: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return CLIENT_COLOR_PALETTE[(h >>> 0) % CLIENT_COLOR_PALETTE.length]!
}

/* ----------------------------------------------------------------- entries */

export interface EntryRowLike {
  id: string
  userId: string
  name: string
  refType: string | null
  refId: string | null
  billable: boolean
  rateOverride: number | null
  start: Date
  end: Date | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Resolved display chain (Rule 1). Dangling/trashed refs read as detached (null). */
export function toChainRef(
  refType: string | null | undefined,
  refId: string | null | undefined,
  ctx: RateContext
): ChainRef | null {
  if (!refType || !refId) return null
  const chain = walkChain(refType, refId, ctx)
  if (!chain) return null
  return {
    refType: refType as RefType,
    refId,
    taskId: chain.taskId,
    taskName: chain.taskName,
    projectId: chain.projectId,
    projectName: chain.projectName,
    clientId: chain.clientId,
    clientName: chain.clientName,
    clientColor: chain.clientId ? clientColor(chain.clientId) : undefined
  }
}

export function toEntryDto(row: EntryRowLike, ctx: RateContext, tags: string[] = []): EntryDto {
  const { rate, source } = resolveEntryRate(
    { userId: row.userId, refType: row.refType, refId: row.refId, rateOverride: row.rateOverride },
    ctx
  )
  const endMs = row.end ? row.end.getTime() : Date.now()
  const durationSec = Math.max(0, Math.round((endMs - row.start.getTime()) / 1000))
  return {
    id: row.id,
    name: row.name,
    ref: toChainRef(row.refType, row.refId, ctx),
    billable: row.billable,
    resolvedRate: rate,
    rateOverridden: source === 'override',
    start: row.start.toISOString(),
    end: row.end ? row.end.toISOString() : null,
    durationSec,
    amount: row.billable && rate != null ? round2((durationSec / 3600) * rate) : null,
    tags
  }
}

export function toTimerState(row: EntryRowLike, ctx: RateContext): TimerState {
  const { rate } = resolveEntryRate(
    { userId: row.userId, refType: row.refType, refId: row.refId, rateOverride: row.rateOverride },
    ctx
  )
  return {
    entryId: row.id,
    name: row.name,
    ref: toChainRef(row.refType, row.refId, ctx),
    billable: row.billable,
    resolvedRate: rate,
    start: row.start.toISOString()
  }
}

/* -------------------------------------------------------------------- tags */

/** Lowercased, `#` stripped, trimmed — '' when nothing is left. */
export function normalizeTagName(raw: string): string {
  return raw.trim().replace(/^#+/, '').trim().toLowerCase()
}

/** Tag names per entry id (trashed tags read as stripped). */
export async function fetchTagsForEntries(
  db: DB,
  entryIds: string[]
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()
  if (!entryIds.length) return map
  const rows = await db
    .select({ entryId: schema.entryTags.entryId, name: schema.tags.name })
    .from(schema.entryTags)
    .innerJoin(schema.tags, eq(schema.tags.id, schema.entryTags.tagId))
    // One array parameter, not one per id: a year of entries is >10k ids, and
    // inArray() would hit Postgres' 65,535 bind-parameter limit on a big range.
    .where(and(inUuids(schema.entryTags.entryId, entryIds), isNull(schema.tags.deletedAt)))
  for (const r of rows) {
    const list = map.get(r.entryId)
    if (list) list.push(r.name)
    else map.set(r.entryId, [r.name])
  }
  for (const list of map.values()) list.sort()
  return map
}

/**
 * Resolves tag names to org tag rows, creating missing ones and un-trashing
 * name matches in trash (org+name is unique). Returns rows in input order.
 */
export async function ensureTags(
  db: DB,
  orgId: string,
  names: string[]
): Promise<{ id: string; name: string }[]> {
  const wanted = [...new Set(names.map(normalizeTagName).filter(Boolean))]
  if (!wanted.length) return []
  const existing = await db
    .select({ id: schema.tags.id, name: schema.tags.name, deletedAt: schema.tags.deletedAt })
    .from(schema.tags)
    .where(and(eq(schema.tags.orgId, orgId), inArray(schema.tags.name, wanted)))
  const trashedIds = existing.filter(t => t.deletedAt !== null).map(t => t.id)
  if (trashedIds.length) {
    await db.update(schema.tags).set({ deletedAt: null }).where(inArray(schema.tags.id, trashedIds))
  }
  const have = new Set(existing.map(t => t.name))
  const missing = wanted.filter(n => !have.has(n))
  const created = missing.length
    ? await db
        .insert(schema.tags)
        .values(missing.map(name => ({ orgId, name })))
        .returning({ id: schema.tags.id, name: schema.tags.name })
    : []
  const byName = new Map([...existing, ...created].map(t => [t.name, { id: t.id, name: t.name }]))
  return wanted.map(n => byName.get(n)!).filter(Boolean)
}

/** Replaces an entry's tag set. */
export async function setEntryTags(db: DB, entryId: string, tagIds: string[]): Promise<void> {
  await db.delete(schema.entryTags).where(eq(schema.entryTags.entryId, entryId))
  if (tagIds.length) {
    await db.insert(schema.entryTags).values(tagIds.map(tagId => ({ entryId, tagId })))
  }
}

/* ------------------------------------------------------- catalog aggregates */

export interface CatalogAggregates {
  /** By client id: tracked seconds + billable amount ($) of entries resolving to it */
  clients: Map<string, { sec: number; amount: number }>
  /** By project id */
  projects: Map<string, { sec: number; amount: number }>
  /** By task id: entries pointing directly at the task */
  tasks: Map<string, { sec: number; count: number }>
}

/**
 * Whole seconds of an ended entry, computed in SQL exactly as toEntryDto()
 * does in JS: Math.max(0, Math.round((end - start) / 1000)) over
 * millisecond-precision timestamps (postgres.js Dates carry ms, so both sides
 * truncate microseconds first; round() is half-up for the positive values the
 * clamp keeps).
 */
const entrySecSql = sql`greatest(0, round(extract(epoch from (date_trunc('milliseconds', ${schema.timeEntries.end}) - date_trunc('milliseconds', ${schema.timeEntries.start})))))`

/**
 * The org's ended, non-trashed entries (all users), pre-summed in SQL per
 * distinct (user, ref, billable, override) — the only inputs Rule 1/Rule 2
 * resolution depends on — so an org with 25k entries ships a few thousand
 * rows instead of 25k. Tracked time and billable amounts are then attributed
 * up the chain against the preloaded context — no N+1. `ctx` may be the
 * still-pending loadRateContext() promise so both round-trips run in parallel.
 */
export async function loadOrgAggregates(
  db: DB,
  orgId: string,
  ctxOrPromise: RateContext | Promise<RateContext>
): Promise<CatalogAggregates> {
  const e = schema.timeEntries
  const rowsQ = db
    .select({
      userId: e.userId,
      refType: e.refType,
      refId: e.refId,
      billable: e.billable,
      rateOverride: e.rateOverride,
      count: sql<number>`count(*)::int`,
      sec: sql<number>`sum(${entrySecSql})::float8`
    })
    .from(e)
    .where(and(eq(e.orgId, orgId), isNull(e.deletedAt), isNotNull(e.end), isNotNull(e.refId)))
    .groupBy(e.userId, e.refType, e.refId, e.billable, e.rateOverride)
  const [rows, ctx] = await Promise.all([rowsQ, ctxOrPromise])

  const agg: CatalogAggregates = { clients: new Map(), projects: new Map(), tasks: new Map() }
  const bump = (m: Map<string, { sec: number; amount: number }>, id: string, sec: number, amount: number) => {
    const cur = m.get(id) ?? { sec: 0, amount: 0 }
    cur.sec += sec
    cur.amount += amount
    m.set(id, cur)
  }

  for (const row of rows) {
    const sec = Number(row.sec)
    const chain = walkChain(row.refType, row.refId, ctx)
    if (!chain) continue
    const { rate } = resolveEntryRate(
      { userId: row.userId, refType: row.refType, refId: row.refId, rateOverride: row.rateOverride },
      ctx
    )
    const amount = row.billable && rate != null ? (sec / 3600) * rate : 0
    if (chain.taskId) {
      const cur = agg.tasks.get(chain.taskId) ?? { sec: 0, count: 0 }
      cur.sec += sec
      cur.count += row.count
      agg.tasks.set(chain.taskId, cur)
    }
    if (chain.projectId) bump(agg.projects, chain.projectId, sec, amount)
    if (chain.clientId) bump(agg.clients, chain.clientId, sec, amount)
  }
  return agg
}

/* ------------------------------------------------------------ catalog DTOs */

// Same ordering as a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
// (the spec defines that call as this collator), but built once: V8 constructs
// a fresh collator per localeCompare call with options — ~30ms to sort 800 tasks.
const nameCollator = new Intl.Collator(undefined, { sensitivity: 'base' })
const byName = <T extends { name: string }>(a: T, b: T) => nameCollator.compare(a.name, b.name)

export function buildClientDtos(ctx: RateContext, agg: CatalogAggregates): ClientDto[] {
  const projectCount = new Map<string, number>()
  const taskCount = new Map<string, number>()
  for (const p of ctx.projects.values()) {
    if (p.clientId) projectCount.set(p.clientId, (projectCount.get(p.clientId) ?? 0) + 1)
  }
  for (const t of ctx.tasks.values()) {
    const clientId = t.projectId ? ctx.projects.get(t.projectId)?.clientId : null
    if (clientId) taskCount.set(clientId, (taskCount.get(clientId) ?? 0) + 1)
  }
  return [...ctx.clients.values()]
    .map(c => {
      const a = agg.clients.get(c.id)
      return {
        id: c.id,
        name: c.name,
        rate: c.rate,
        color: clientColor(c.id),
        projectCount: projectCount.get(c.id) ?? 0,
        taskCount: taskCount.get(c.id) ?? 0,
        trackedSec: a?.sec ?? 0,
        amount: round2(a?.amount ?? 0)
      }
    })
    .sort(byName)
}

export function buildProjectDtos(
  ctx: RateContext,
  agg: CatalogAggregates,
  userId: string
): ProjectDto[] {
  const open = new Map<string, number>()
  const done = new Map<string, number>()
  for (const t of ctx.tasks.values()) {
    if (!t.projectId) continue
    const m = t.done ? done : open
    m.set(t.projectId, (m.get(t.projectId) ?? 0) + 1)
  }
  const fallback = ctx.userRates.get(userId)
  return [...ctx.projects.values()]
    .map(p => {
      const client = p.clientId ? ctx.clients.get(p.clientId) : undefined
      const { rate, source } = pickRate({
        projectRate: p.rate,
        clientRate: client?.rate,
        memberRate: fallback?.memberRate,
        defaultRate: fallback?.defaultRate
      })
      const a = agg.projects.get(p.id)
      return {
        id: p.id,
        name: p.name,
        clientId: client?.id ?? null,
        clientName: client?.name ?? null,
        clientColor: client ? clientColor(client.id) : null,
        rate: p.rate,
        resolvedRate: rate,
        rateSource: source as ProjectDto['rateSource'],
        billableDefault: p.billableDefault,
        estimateMinutes: p.estimateMinutes,
        visibility: p.visibility as ProjectDto['visibility'],
        archived: p.archived,
        openTasks: open.get(p.id) ?? 0,
        doneTasks: done.get(p.id) ?? 0,
        trackedSec: a?.sec ?? 0,
        amount: round2(a?.amount ?? 0)
      }
    })
    .sort(byName)
}

export function buildTaskDtos(ctx: RateContext, agg: CatalogAggregates, userId: string): TaskDto[] {
  const fallback = ctx.userRates.get(userId)
  return [...ctx.tasks.values()]
    .map(t => {
      const project = t.projectId ? ctx.projects.get(t.projectId) : undefined
      const client = project?.clientId ? ctx.clients.get(project.clientId) : undefined
      const a = agg.tasks.get(t.id)
      const { rate, source } = pickRate({
        taskRate: t.rate,
        projectRate: project?.rate,
        clientRate: client?.rate,
        memberRate: fallback?.memberRate,
        defaultRate: fallback?.defaultRate
      })
      return {
        id: t.id,
        name: t.name,
        projectId: project?.id ?? null,
        projectName: project?.name ?? null,
        clientName: client?.name ?? null,
        rate: t.rate,
        resolvedRate: rate,
        rateSource: source as TaskDto['rateSource'],
        estimateMinutes: t.estimateMinutes,
        done: t.done,
        entryCount: a?.count ?? 0,
        trackedSec: a?.sec ?? 0
      }
    })
    .sort(byName)
}

/**
 * TagDto list: usage stats over ended, non-trashed org entries, aggregated in
 * SQL (tag rows, usage totals and "used on" buckets — three queries in
 * parallel) instead of shipping one row per tag link.
 * "Used on" = distinct projects/clients the tagged time resolves to, with the
 * chain walked by the same join shape as the report query — equivalent to
 * walkChain(): trashed catalog rows read as detached, a task whose project is
 * gone counts for nothing, time under a project counts for the project only.
 * Pass `tagId` to build just that tag's DTO (tag create/delete responses).
 */
export async function buildTagDtos(db: DB, orgId: string, tagId?: string): Promise<TagDto[]> {
  const e = schema.timeEntries
  const et = schema.entryTags
  const tagFilter = tagId ? eq(et.tagId, tagId) : undefined
  const live = and(eq(e.orgId, orgId), isNull(e.deletedAt), isNotNull(e.end), tagFilter)

  const tagRowsQ = db
    .select({ id: schema.tags.id, name: schema.tags.name })
    .from(schema.tags)
    .where(
      and(
        eq(schema.tags.orgId, orgId),
        isNull(schema.tags.deletedAt),
        tagId ? eq(schema.tags.id, tagId) : undefined
      )
    )

  const usageQ = db
    .select({
      tagId: et.tagId,
      count: sql<number>`count(*)::int`,
      sec: sql<number>`sum(${entrySecSql})::float8`,
      last: sql<Date>`max(${e.start})`.mapWith(e.start)
    })
    .from(et)
    .innerJoin(e, eq(e.id, et.entryId))
    .where(live)
    .groupBy(et.tagId)

  const usedOnQ = db.execute<{ tag_id: string, used_on: number }>(sql`
    select x.tag_id, count(*)::int as used_on
    from (
      select distinct et.tag_id, coalesce(p.id, c.id) as bucket, p.id is null as client_bucket
      from ${et} et
      join ${e} e on e.id = et.entry_id
      left join tasks t
        on e.ref_type = 'task' and t.id = e.ref_id and t.org_id = e.org_id and t.deleted_at is null
      left join projects p
        on p.org_id = e.org_id and p.deleted_at is null
        and p.id = case when e.ref_type = 'project' then e.ref_id else t.project_id end
      left join clients c
        on c.org_id = e.org_id and c.deleted_at is null
        and c.id = case when e.ref_type = 'client' then e.ref_id else p.client_id end
      where e.org_id = ${orgId}
        and e.deleted_at is null
        and e."end" is not null
        and coalesce(p.id, c.id) is not null
        ${tagId ? sql`and et.tag_id = ${tagId}` : sql``}
    ) x
    group by x.tag_id
  `)

  const [tagRows, usage, usedOnRes] = await Promise.all([tagRowsQ, usageQ, usedOnQ])
  const usedOnRows = (Array.isArray(usedOnRes) ? usedOnRes : (usedOnRes as { rows: unknown[] }).rows) as {
    tag_id: string
    used_on: number
  }[]
  const stats = new Map(usage.map(u => [u.tagId, u]))
  const usedOn = new Map(usedOnRows.map(r => [r.tag_id, Number(r.used_on)]))

  return tagRows
    .map(t => {
      const s = stats.get(t.id)
      return {
        id: t.id,
        name: t.name,
        entryCount: s?.count ?? 0,
        trackedSec: s ? Number(s.sec) : 0,
        usedOn: usedOn.get(t.id) ?? 0,
        lastUsed: s?.last ? s.last.toISOString() : null
      }
    })
    .sort(byName)
}
