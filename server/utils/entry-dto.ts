// DTO builders: entries/timer (chain derivation per Rule 1), catalog DTOs with
// tracked/amount aggregates, deterministic client colors, tag helpers.
import { and, eq, inArray, isNotNull, isNull, schema } from './drizzle'
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
    .where(and(inArray(schema.entryTags.entryId, entryIds), isNull(schema.tags.deletedAt)))
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
 * One pass over the org's ended, non-trashed entries (all users): tracked time
 * and billable amounts attributed up the chain. Rates resolve per Rule 2
 * against the preloaded context — no N+1.
 */
export async function loadOrgAggregates(
  db: DB,
  orgId: string,
  ctx: RateContext
): Promise<CatalogAggregates> {
  const rows = await db
    .select({
      userId: schema.timeEntries.userId,
      refType: schema.timeEntries.refType,
      refId: schema.timeEntries.refId,
      billable: schema.timeEntries.billable,
      rateOverride: schema.timeEntries.rateOverride,
      start: schema.timeEntries.start,
      end: schema.timeEntries.end
    })
    .from(schema.timeEntries)
    .where(
      and(
        eq(schema.timeEntries.orgId, orgId),
        isNull(schema.timeEntries.deletedAt),
        isNotNull(schema.timeEntries.end)
      )
    )

  const agg: CatalogAggregates = { clients: new Map(), projects: new Map(), tasks: new Map() }
  const bump = (m: Map<string, { sec: number; amount: number }>, id: string, sec: number, amount: number) => {
    const cur = m.get(id) ?? { sec: 0, amount: 0 }
    cur.sec += sec
    cur.amount += amount
    m.set(id, cur)
  }

  for (const row of rows) {
    const sec = Math.max(0, Math.round((row.end!.getTime() - row.start.getTime()) / 1000))
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
      cur.count += 1
      agg.tasks.set(chain.taskId, cur)
    }
    if (chain.projectId) bump(agg.projects, chain.projectId, sec, amount)
    if (chain.clientId) bump(agg.clients, chain.clientId, sec, amount)
  }
  return agg
}

/* ------------------------------------------------------------ catalog DTOs */

const byName = <T extends { name: string }>(a: T, b: T) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

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

export function buildTaskDtos(ctx: RateContext, agg: CatalogAggregates): TaskDto[] {
  return [...ctx.tasks.values()]
    .map(t => {
      const project = t.projectId ? ctx.projects.get(t.projectId) : undefined
      const client = project?.clientId ? ctx.clients.get(project.clientId) : undefined
      const a = agg.tasks.get(t.id)
      return {
        id: t.id,
        name: t.name,
        projectId: project?.id ?? null,
        projectName: project?.name ?? null,
        clientName: client?.name ?? null,
        estimateMinutes: t.estimateMinutes,
        done: t.done,
        entryCount: a?.count ?? 0,
        trackedSec: a?.sec ?? 0
      }
    })
    .sort(byName)
}

/** TagDto list: usage counts over ended, non-trashed org entries. */
export async function buildTagDtos(db: DB, orgId: string, ctx: RateContext): Promise<TagDto[]> {
  const tagRows = await db
    .select({ id: schema.tags.id, name: schema.tags.name })
    .from(schema.tags)
    .where(and(eq(schema.tags.orgId, orgId), isNull(schema.tags.deletedAt)))

  const usage = await db
    .select({
      tagId: schema.entryTags.tagId,
      refType: schema.timeEntries.refType,
      refId: schema.timeEntries.refId,
      start: schema.timeEntries.start,
      end: schema.timeEntries.end
    })
    .from(schema.entryTags)
    .innerJoin(schema.timeEntries, eq(schema.timeEntries.id, schema.entryTags.entryId))
    .where(
      and(
        eq(schema.timeEntries.orgId, orgId),
        isNull(schema.timeEntries.deletedAt),
        isNotNull(schema.timeEntries.end)
      )
    )

  const stats = new Map<
    string,
    { count: number; sec: number; last: Date | null; buckets: Set<string> }
  >()
  for (const u of usage) {
    let s = stats.get(u.tagId)
    if (!s) {
      s = { count: 0, sec: 0, last: null, buckets: new Set() }
      stats.set(u.tagId, s)
    }
    s.count += 1
    s.sec += Math.max(0, Math.round((u.end!.getTime() - u.start.getTime()) / 1000))
    if (!s.last || u.start > s.last) s.last = u.start
    const chain = walkChain(u.refType, u.refId, ctx)
    // "Used on" = distinct projects/clients the tagged time resolves to.
    if (chain?.projectId) s.buckets.add(`p:${chain.projectId}`)
    else if (chain?.clientId) s.buckets.add(`c:${chain.clientId}`)
  }

  return tagRows
    .map(t => {
      const s = stats.get(t.id)
      return {
        id: t.id,
        name: t.name,
        entryCount: s?.count ?? 0,
        trackedSec: s?.sec ?? 0,
        usedOn: s?.buckets.size ?? 0,
        lastUsed: s?.last ? s.last.toISOString() : null
      }
    })
    .sort(byName)
}
