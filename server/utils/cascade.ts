// README Rule 3 — cascade delete for clients (and the same pattern for projects).
// Checked levels soft-delete (deleted_at = now, 30-day trash). Unchecked levels
// are kept and detached: client_id / project_id cleared, and entries pointing
// DIRECTLY at a deleted object get ref_type/ref_id nulled — time is never lost
// silently, and nothing is ever hard-deleted here.
//
// This file is the SQL half: collect the live subtree, ask cascade-plan.ts what
// happens to it, apply that, and snapshot every reference cleared so undo can
// put it back. Which rows go where is the pure table in ./cascade-plan.
import { randomUUID } from 'node:crypto'
import { and, eq, inArray, inUuids, isNotNull, isNull, or, schema } from './drizzle'
import type { DB } from './drizzle'
import { planClientCascade, planProjectCascade } from './cascade-plan'
import type { ClientCascadeFlags, ProjectCascadeFlags, Subtree } from './cascade-plan'

/** Works for both the root db handle and a transaction handle. */
type Dbx = DB | Parameters<Parameters<DB['transaction']>[0]>[0]

/** Cleared references remembered per row, so /api/restore can re-apply them on undo. */
export interface RelinkSnapshot {
  projects: { id: string, clientId: string }[]
  tasks: { id: string, projectId: string }[]
  entries: { id: string, refType: 'client' | 'project' | 'task', refId: string }[]
}

/** DeleteResult extension (frozen DTO untouched): adds the relink snapshot for undo. */
export interface CascadeDeleteResult extends DeleteResult {
  relinked: RelinkSnapshot
  /**
   * delete_batches.id — the whole operation, recorded server-side. Undo posts
   * this one id instead of every uuid it touched, which neither the 1MB body
   * cap nor /api/restore's per-array limits could carry (ticktimer/Tick#11).
   */
  batchId: string
}

/** Entry ref match: points directly at one of these ids (Rule 1 deepest ref). */
function refCondition(clientIds: string[], projectIds: string[], taskIds: string[]) {
  const conds = []
  if (clientIds.length) {
    conds.push(
      and(eq(schema.timeEntries.refType, 'client'), inArray(schema.timeEntries.refId, clientIds))
    )
  }
  if (projectIds.length) {
    conds.push(
      and(eq(schema.timeEntries.refType, 'project'), inArray(schema.timeEntries.refId, projectIds))
    )
  }
  if (taskIds.length) {
    conds.push(
      and(eq(schema.timeEntries.refType, 'task'), inArray(schema.timeEntries.refId, taskIds))
    )
  }
  return conds.length ? or(...conds) : undefined
}

async function collectEndedEntryIds(
  db: Dbx,
  orgId: string,
  clientIds: string[],
  projectIds: string[],
  taskIds: string[]
): Promise<string[]> {
  const cond = refCondition(clientIds, projectIds, taskIds)
  if (!cond) return []
  const rows = await db
    .select({ id: schema.timeEntries.id })
    .from(schema.timeEntries)
    .where(
      and(
        eq(schema.timeEntries.orgId, orgId),
        isNull(schema.timeEntries.deletedAt),
        isNotNull(schema.timeEntries.end), // the running timer is never trashed by a cascade
        cond
      )
    )
  return rows.map(r => r.id)
}

async function collectClientSubtree(db: Dbx, orgId: string, clientId: string): Promise<Subtree> {
  const projectRows = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.orgId, orgId),
        eq(schema.projects.clientId, clientId),
        isNull(schema.projects.deletedAt)
      )
    )
  const projectIds = projectRows.map(r => r.id)
  const taskIds = await collectTaskIds(db, orgId, projectIds)
  const endedEntryIds = await collectEndedEntryIds(db, orgId, [clientId], projectIds, taskIds)
  return { projectIds, taskIds, endedEntryIds }
}

async function collectTaskIds(db: Dbx, orgId: string, projectIds: string[]): Promise<string[]> {
  if (!projectIds.length) return []
  const rows = await db
    .select({ id: schema.tasks.id })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.orgId, orgId),
        inArray(schema.tasks.projectId, projectIds),
        isNull(schema.tasks.deletedAt)
      )
    )
  return rows.map(r => r.id)
}

async function requireLive(
  db: Dbx,
  table: typeof schema.clients | typeof schema.projects | typeof schema.tasks,
  orgId: string,
  id: string,
  label: string
) {
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, id), eq(table.orgId, orgId), isNull(table.deletedAt)))
    .limit(1)
  if (!row) throw createError({ statusCode: 404, message: `${label} not found` })
}

/* ------------------------------------------------------------------ counts */

export async function clientCascadeCounts(
  db: DB,
  orgId: string,
  clientId: string
): Promise<CascadeCounts> {
  await requireLive(db, schema.clients, orgId, clientId, 'Client')
  const sub = await collectClientSubtree(db, orgId, clientId)
  return {
    projects: sub.projectIds.length,
    tasks: sub.taskIds.length,
    entries: sub.endedEntryIds.length
  }
}

export async function projectCascadeCounts(
  db: DB,
  orgId: string,
  projectId: string
): Promise<CascadeCounts> {
  await requireLive(db, schema.projects, orgId, projectId, 'Project')
  const taskIds = await collectTaskIds(db, orgId, [projectId])
  const endedEntryIds = await collectEndedEntryIds(db, orgId, [], [projectId], taskIds)
  return { projects: 0, tasks: taskIds.length, entries: endedEntryIds.length }
}

/* ----------------------------------------------------------------- deletes */

async function softDeleteEntries(
  db: Dbx,
  orgId: string,
  ids: string[],
  now: Date,
  batchId: string
) {
  if (!ids.length) return
  await db
    .update(schema.timeEntries)
    .set({ deletedAt: now, deleteBatchId: batchId })
    // Entry id lists are unbounded (a client's whole history): one array param.
    .where(and(eq(schema.timeEntries.orgId, orgId), inUuids(schema.timeEntries.id, ids)))
}

/**
 * Record the operation so undo can name it with one id. The relink snapshot
 * rides along because a detached row is still alive — nothing on it says which
 * cascade cleared its parent, or what the parent was.
 */
async function recordBatch(
  db: Dbx,
  batchId: string,
  orgId: string,
  relinked: RelinkSnapshot
): Promise<void> {
  await db.insert(schema.deleteBatches).values({ id: batchId, orgId, relinked })
}

/**
 * Detach surviving (non-trashed, incl. running) entries whose DIRECT ref was
 * just deleted → ref cleared, time kept. Returns the prior refs (relink
 * snapshot) so undo can put them back.
 */
async function detachEntries(
  db: Dbx,
  orgId: string,
  clientIds: string[],
  projectIds: string[],
  taskIds: string[]
): Promise<RelinkSnapshot['entries']> {
  const cond = refCondition(clientIds, projectIds, taskIds)
  if (!cond) return []
  // Snapshot the refs being cleared, then clear them (same tx, same condition).
  const prior = await db
    .select({
      id: schema.timeEntries.id,
      refType: schema.timeEntries.refType,
      refId: schema.timeEntries.refId
    })
    .from(schema.timeEntries)
    .where(and(eq(schema.timeEntries.orgId, orgId), isNull(schema.timeEntries.deletedAt), cond))
  if (!prior.length) return []
  await db
    .update(schema.timeEntries)
    .set({ refType: null, refId: null })
    .where(
      and(
        eq(schema.timeEntries.orgId, orgId),
        inUuids(schema.timeEntries.id, prior.map(r => r.id))
      )
    )
  return prior.filter(
    (r): r is RelinkSnapshot['entries'][number] => r.refType !== null && r.refId !== null
  )
}

export async function cascadeDeleteClient(
  db: DB,
  orgId: string,
  clientId: string,
  flags: ClientCascadeFlags
): Promise<CascadeDeleteResult> {
  return db.transaction(async tx => {
    await requireLive(tx, schema.clients, orgId, clientId, 'Client')
    const sub = await collectClientSubtree(tx, orgId, clientId)
    const now = new Date()
    const batchId = randomUUID()
    const plan = planClientCascade(clientId, sub, flags)
    const { deletedProjects, deletedTasks, deletedEntries } = plan

    await tx
      .update(schema.clients)
      .set({ deletedAt: now, deleteBatchId: batchId })
      .where(eq(schema.clients.id, clientId))
    if (deletedProjects.length) {
      await tx
        .update(schema.projects)
        .set({ deletedAt: now, deleteBatchId: batchId })
        .where(and(eq(schema.projects.orgId, orgId), inArray(schema.projects.id, deletedProjects)))
    }
    if (deletedTasks.length) {
      await tx
        .update(schema.tasks)
        .set({ deletedAt: now, deleteBatchId: batchId })
        .where(and(eq(schema.tasks.orgId, orgId), inArray(schema.tasks.id, deletedTasks)))
    }
    await softDeleteEntries(tx, orgId, deletedEntries, now, batchId)

    // Kept projects lose their client (rate falls back per Rule 2).
    let relinkProjects: RelinkSnapshot['projects'] = []
    if (plan.detachedProjects.length) {
      const rows = await tx
        .update(schema.projects)
        .set({ clientId: null })
        .where(
          and(eq(schema.projects.orgId, orgId), inArray(schema.projects.id, plan.detachedProjects))
        )
        .returning({ id: schema.projects.id })
      relinkProjects = rows.map(r => ({ id: r.id, clientId })) // they all pointed at this client
    }

    // Kept tasks whose project was deleted become standalone.
    let relinkTasks: RelinkSnapshot['tasks'] = []
    if (plan.detachedTasks.length) {
      // Remember each task's project before clearing it.
      const prior = await tx
        .select({ id: schema.tasks.id, projectId: schema.tasks.projectId })
        .from(schema.tasks)
        .where(and(eq(schema.tasks.orgId, orgId), inArray(schema.tasks.id, plan.detachedTasks)))
      await tx
        .update(schema.tasks)
        .set({ projectId: null })
        .where(and(eq(schema.tasks.orgId, orgId), inArray(schema.tasks.id, plan.detachedTasks)))
      relinkTasks = prior.filter(
        (r): r is RelinkSnapshot['tasks'][number] => r.projectId !== null
      )
    }

    // Kept entries (and the running timer) pointing directly at anything deleted.
    const relinkEntries = await detachEntries(
      tx,
      orgId,
      plan.clearedRefs.clientIds,
      plan.clearedRefs.projectIds,
      plan.clearedRefs.taskIds
    )

    const relinked = { projects: relinkProjects, tasks: relinkTasks, entries: relinkEntries }
    await recordBatch(tx, batchId, orgId, relinked)

    return {
      deleted: {
        clients: [clientId],
        projects: deletedProjects,
        tasks: deletedTasks,
        entries: deletedEntries
      },
      detached: {
        projects: relinkProjects.length,
        tasks: relinkTasks.length,
        entries: relinkEntries.length
      },
      relinked,
      batchId
    }
  })
}

export async function cascadeDeleteProject(
  db: DB,
  orgId: string,
  projectId: string,
  flags: ProjectCascadeFlags
): Promise<CascadeDeleteResult> {
  return db.transaction(async tx => {
    await requireLive(tx, schema.projects, orgId, projectId, 'Project')
    const taskIds = await collectTaskIds(tx, orgId, [projectId])
    const endedEntryIds = await collectEndedEntryIds(tx, orgId, [], [projectId], taskIds)
    const now = new Date()
    const batchId = randomUUID()
    const plan = planProjectCascade(projectId, { projectIds: [], taskIds, endedEntryIds }, flags)
    const { deletedTasks, deletedEntries } = plan

    await tx
      .update(schema.projects)
      .set({ deletedAt: now, deleteBatchId: batchId })
      .where(eq(schema.projects.id, projectId))
    if (deletedTasks.length) {
      await tx
        .update(schema.tasks)
        .set({ deletedAt: now, deleteBatchId: batchId })
        .where(and(eq(schema.tasks.orgId, orgId), inArray(schema.tasks.id, deletedTasks)))
    }
    await softDeleteEntries(tx, orgId, deletedEntries, now, batchId)

    // Kept tasks become standalone (their project is gone).
    let relinkTasks: RelinkSnapshot['tasks'] = []
    if (plan.detachedTasks.length) {
      const rows = await tx
        .update(schema.tasks)
        .set({ projectId: null })
        .where(and(eq(schema.tasks.orgId, orgId), inArray(schema.tasks.id, plan.detachedTasks)))
        .returning({ id: schema.tasks.id })
      relinkTasks = rows.map(r => ({ id: r.id, projectId })) // they all pointed at this project
    }

    const relinkEntries = await detachEntries(
      tx,
      orgId,
      plan.clearedRefs.clientIds,
      plan.clearedRefs.projectIds,
      plan.clearedRefs.taskIds
    )

    const relinked = { projects: [], tasks: relinkTasks, entries: relinkEntries }
    await recordBatch(tx, batchId, orgId, relinked)

    return {
      deleted: { clients: [], projects: [projectId], tasks: deletedTasks, entries: deletedEntries },
      detached: { projects: 0, tasks: relinkTasks.length, entries: relinkEntries.length },
      relinked,
      batchId
    }
  })
}

/** Task delete (no dialog): trash the task, keep + detach its direct entries. */
export async function deleteTaskWithDetach(
  db: DB,
  orgId: string,
  taskId: string
): Promise<CascadeDeleteResult> {
  return db.transaction(async tx => {
    await requireLive(tx, schema.tasks, orgId, taskId, 'Task')
    const batchId = randomUUID()
    await tx
      .update(schema.tasks)
      .set({ deletedAt: new Date(), deleteBatchId: batchId })
      .where(eq(schema.tasks.id, taskId))
    // One task, but its detached entries are as unbounded as any cascade's.
    const relinkEntries = await detachEntries(tx, orgId, [], [], [taskId])
    const relinked = { projects: [], tasks: [], entries: relinkEntries }
    await recordBatch(tx, batchId, orgId, relinked)
    return {
      deleted: { clients: [], projects: [], tasks: [taskId], entries: [] },
      detached: { projects: 0, tasks: 0, entries: relinkEntries.length },
      relinked,
      batchId
    }
  })
}
