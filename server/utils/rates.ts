// Rule 2 — rate inheritance, first non-null wins:
//   entry.rate_override → project.rate → client.rate → org_member.rate → user.default_rate
// Chain (Rule 1) resolves at read time: task → task.project → project.client.
// `loadRateContext` pulls the org catalog + per-user fallbacks once so lists avoid N+1.
import { and, eq, isNull, schema } from './drizzle'
import type { DB } from './drizzle'

export type RateSource = 'override' | 'project' | 'client' | 'member' | 'user' | 'none'

export interface CtxClient {
  id: string
  name: string
  rate: number | null
}

export interface CtxProject {
  id: string
  name: string
  clientId: string | null
  rate: number | null
  billableDefault: boolean
  estimateMinutes: number | null
  visibility: string
  archived: boolean
}

export interface CtxTask {
  id: string
  name: string
  projectId: string | null
  estimateMinutes: number | null
  done: boolean
}

export interface RateContext {
  clients: Map<string, CtxClient>
  projects: Map<string, CtxProject>
  tasks: Map<string, CtxTask>
  /** Per-user fallbacks: org_member.rate + user.default_rate, keyed by userId */
  userRates: Map<string, { memberRate: number | null; defaultRate: number | null }>
}

/** Loads the org's live (non-trashed) catalog + member fallback rates. 4 small queries. */
export async function loadRateContext(db: DB, orgId: string): Promise<RateContext> {
  const [clientRows, projectRows, taskRows, memberRows] = await Promise.all([
    db
      .select({ id: schema.clients.id, name: schema.clients.name, rate: schema.clients.rate })
      .from(schema.clients)
      .where(and(eq(schema.clients.orgId, orgId), isNull(schema.clients.deletedAt))),
    db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        clientId: schema.projects.clientId,
        rate: schema.projects.rate,
        billableDefault: schema.projects.billableDefault,
        estimateMinutes: schema.projects.estimateMinutes,
        visibility: schema.projects.visibility,
        archived: schema.projects.archived
      })
      .from(schema.projects)
      .where(and(eq(schema.projects.orgId, orgId), isNull(schema.projects.deletedAt))),
    db
      .select({
        id: schema.tasks.id,
        name: schema.tasks.name,
        projectId: schema.tasks.projectId,
        estimateMinutes: schema.tasks.estimateMinutes,
        done: schema.tasks.done
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.orgId, orgId), isNull(schema.tasks.deletedAt))),
    db
      .select({
        userId: schema.orgMembers.userId,
        memberRate: schema.orgMembers.rate,
        defaultRate: schema.users.defaultRate
      })
      .from(schema.orgMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.orgMembers.userId))
      .where(eq(schema.orgMembers.orgId, orgId))
  ])

  return {
    clients: new Map(clientRows.map(c => [c.id, c])),
    projects: new Map(projectRows.map(p => [p.id, p])),
    tasks: new Map(taskRows.map(t => [t.id, t])),
    userRates: new Map(
      memberRows.map(m => [m.userId, { memberRate: m.memberRate, defaultRate: m.defaultRate }])
    )
  }
}

export interface ChainInfo {
  taskId?: string
  taskName?: string
  projectId?: string
  projectName?: string
  clientId?: string
  clientName?: string
  projectRate: number | null
  clientRate: number | null
  /** project.billable_default when a project resolves, else true (Rule 2) */
  billableDefault: boolean
}

/**
 * Walks the deepest ref up the chain (Rule 1). Returns null when the ref is
 * absent or dangling (points at a trashed row) — callers treat that as detached.
 */
export function walkChain(
  refType: string | null | undefined,
  refId: string | null | undefined,
  ctx: RateContext
): ChainInfo | null {
  if (!refType || !refId) return null
  const info: ChainInfo = { projectRate: null, clientRate: null, billableDefault: true }
  let projectId: string | null = null

  if (refType === 'task') {
    const task = ctx.tasks.get(refId)
    if (!task) return null
    info.taskId = task.id
    info.taskName = task.name
    projectId = task.projectId
  } else if (refType === 'project') {
    projectId = refId
  } else if (refType === 'client') {
    const client = ctx.clients.get(refId)
    if (!client) return null
    info.clientId = client.id
    info.clientName = client.name
    info.clientRate = client.rate
    return info
  } else {
    return null
  }

  if (projectId) {
    const project = ctx.projects.get(projectId)
    if (!project) {
      // Dangling project ref: direct project ref → detached; task ref → chain stops at task.
      return refType === 'project' ? null : info
    }
    info.projectId = project.id
    info.projectName = project.name
    info.projectRate = project.rate
    info.billableDefault = project.billableDefault
    if (project.clientId) {
      const client = ctx.clients.get(project.clientId)
      if (client) {
        info.clientId = client.id
        info.clientName = client.name
        info.clientRate = client.rate
      }
    }
  } else if (refType === 'project') {
    return null
  }

  return info
}

/** Pure Rule 2 pick: first non-null wins. */
export function pickRate(opts: {
  rateOverride?: number | null
  projectRate?: number | null
  clientRate?: number | null
  memberRate?: number | null
  defaultRate?: number | null
}): { rate: number | null; source: RateSource } {
  if (opts.rateOverride != null) return { rate: opts.rateOverride, source: 'override' }
  if (opts.projectRate != null) return { rate: opts.projectRate, source: 'project' }
  if (opts.clientRate != null) return { rate: opts.clientRate, source: 'client' }
  if (opts.memberRate != null) return { rate: opts.memberRate, source: 'member' }
  if (opts.defaultRate != null) return { rate: opts.defaultRate, source: 'user' }
  return { rate: null, source: 'none' }
}

/** Batch-friendly resolution against a preloaded context (no queries). */
export function resolveEntryRate(
  entry: {
    userId: string
    refType: string | null
    refId: string | null
    rateOverride: number | null
  },
  ctx: RateContext
): { rate: number | null; source: RateSource } {
  const chain = walkChain(entry.refType, entry.refId, ctx)
  const fallback = ctx.userRates.get(entry.userId)
  return pickRate({
    rateOverride: entry.rateOverride,
    projectRate: chain?.projectRate,
    clientRate: chain?.clientRate,
    memberRate: fallback?.memberRate,
    defaultRate: fallback?.defaultRate
  })
}

/** Single-entry convenience (Rule 2). For lists use loadRateContext + resolveEntryRate. */
export async function resolveRate(
  db: DB,
  orgId: string,
  userId: string,
  entry: { refType?: string | null; refId?: string | null; rateOverride?: number | null }
): Promise<number | null> {
  const ctx = await loadRateContext(db, orgId)
  return resolveEntryRate(
    {
      userId,
      refType: entry.refType ?? null,
      refId: entry.refId ?? null,
      rateOverride: entry.rateOverride ?? null
    },
    ctx
  ).rate
}
