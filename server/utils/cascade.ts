// README Rule 3 — cascade delete for clients (and the same pattern for projects).
// Checked levels soft-delete (deleted_at = now, 30-day trash). Unchecked levels
// are kept and detached: client_id / project_id cleared, and entries pointing
// DIRECTLY at a deleted object get ref_type/ref_id nulled — time is never lost
// silently, and nothing is ever hard-deleted here.
import { and, eq, inArray, isNotNull, isNull, or, schema } from './drizzle'
import type { DB } from './drizzle'

/** Works for both the root db handle and a transaction handle. */
type Dbx = DB | Parameters<Parameters<DB['transaction']>[0]>[0]

export interface ClientCascadeFlags {
  cascadeProjects: boolean
  cascadeTasks: boolean
  cascadeEntries: boolean
}

export interface ProjectCascadeFlags {
  cascadeTasks: boolean
  cascadeEntries: boolean
}

interface Subtree {
  projectIds: string[]
  taskIds: string[]
  /** Ended, non-trashed entries resolving into the subtree (all org users). */
  endedEntryIds: string[]
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

async function softDeleteEntries(db: Dbx, orgId: string, ids: string[], now: Date) {
  if (!ids.length) return
  await db
    .update(schema.timeEntries)
    .set({ deletedAt: now })
    .where(and(eq(schema.timeEntries.orgId, orgId), inArray(schema.timeEntries.id, ids)))
}

/**
 * Detach surviving (non-trashed, incl. running) entries whose DIRECT ref was
 * just deleted → ref cleared, time kept. Returns how many were detached.
 */
async function detachEntries(
  db: Dbx,
  orgId: string,
  clientIds: string[],
  projectIds: string[],
  taskIds: string[]
): Promise<number> {
  const cond = refCondition(clientIds, projectIds, taskIds)
  if (!cond) return 0
  const rows = await db
    .update(schema.timeEntries)
    .set({ refType: null, refId: null })
    .where(and(eq(schema.timeEntries.orgId, orgId), isNull(schema.timeEntries.deletedAt), cond))
    .returning({ id: schema.timeEntries.id })
  return rows.length
}

export async function cascadeDeleteClient(
  db: DB,
  orgId: string,
  clientId: string,
  flags: ClientCascadeFlags
): Promise<DeleteResult> {
  return db.transaction(async tx => {
    await requireLive(tx, schema.clients, orgId, clientId, 'Client')
    const sub = await collectClientSubtree(tx, orgId, clientId)
    const now = new Date()

    const deletedProjects = flags.cascadeProjects ? sub.projectIds : []
    const deletedTasks = flags.cascadeTasks ? sub.taskIds : []
    const deletedEntries = flags.cascadeEntries ? sub.endedEntryIds : []

    await tx
      .update(schema.clients)
      .set({ deletedAt: now })
      .where(eq(schema.clients.id, clientId))
    if (deletedProjects.length) {
      await tx
        .update(schema.projects)
        .set({ deletedAt: now })
        .where(and(eq(schema.projects.orgId, orgId), inArray(schema.projects.id, deletedProjects)))
    }
    if (deletedTasks.length) {
      await tx
        .update(schema.tasks)
        .set({ deletedAt: now })
        .where(and(eq(schema.tasks.orgId, orgId), inArray(schema.tasks.id, deletedTasks)))
    }
    await softDeleteEntries(tx, orgId, deletedEntries, now)

    // Kept projects lose their client (rate falls back per Rule 2).
    let detachedProjects = 0
    if (!flags.cascadeProjects && sub.projectIds.length) {
      const rows = await tx
        .update(schema.projects)
        .set({ clientId: null })
        .where(and(eq(schema.projects.orgId, orgId), inArray(schema.projects.id, sub.projectIds)))
        .returning({ id: schema.projects.id })
      detachedProjects = rows.length
    }

    // Kept tasks whose project was deleted become standalone.
    let detachedTasks = 0
    if (flags.cascadeProjects && !flags.cascadeTasks && sub.taskIds.length) {
      const rows = await tx
        .update(schema.tasks)
        .set({ projectId: null })
        .where(and(eq(schema.tasks.orgId, orgId), inArray(schema.tasks.id, sub.taskIds)))
        .returning({ id: schema.tasks.id })
      detachedTasks = rows.length
    }

    // Kept entries (and the running timer) pointing directly at anything deleted.
    const detachedEntries = await detachEntries(
      tx,
      orgId,
      [clientId],
      deletedProjects,
      deletedTasks
    )

    return {
      deleted: {
        clients: [clientId],
        projects: deletedProjects,
        tasks: deletedTasks,
        entries: deletedEntries
      },
      detached: { projects: detachedProjects, tasks: detachedTasks, entries: detachedEntries }
    }
  })
}

export async function cascadeDeleteProject(
  db: DB,
  orgId: string,
  projectId: string,
  flags: ProjectCascadeFlags
): Promise<DeleteResult> {
  return db.transaction(async tx => {
    await requireLive(tx, schema.projects, orgId, projectId, 'Project')
    const taskIds = await collectTaskIds(tx, orgId, [projectId])
    const endedEntryIds = await collectEndedEntryIds(tx, orgId, [], [projectId], taskIds)
    const now = new Date()

    const deletedTasks = flags.cascadeTasks ? taskIds : []
    const deletedEntries = flags.cascadeEntries ? endedEntryIds : []

    await tx
      .update(schema.projects)
      .set({ deletedAt: now })
      .where(eq(schema.projects.id, projectId))
    if (deletedTasks.length) {
      await tx
        .update(schema.tasks)
        .set({ deletedAt: now })
        .where(and(eq(schema.tasks.orgId, orgId), inArray(schema.tasks.id, deletedTasks)))
    }
    await softDeleteEntries(tx, orgId, deletedEntries, now)

    // Kept tasks become standalone (their project is gone).
    let detachedTasks = 0
    if (!flags.cascadeTasks && taskIds.length) {
      const rows = await tx
        .update(schema.tasks)
        .set({ projectId: null })
        .where(and(eq(schema.tasks.orgId, orgId), inArray(schema.tasks.id, taskIds)))
        .returning({ id: schema.tasks.id })
      detachedTasks = rows.length
    }

    const detachedEntries = await detachEntries(tx, orgId, [], [projectId], deletedTasks)

    return {
      deleted: { clients: [], projects: [projectId], tasks: deletedTasks, entries: deletedEntries },
      detached: { projects: 0, tasks: detachedTasks, entries: detachedEntries }
    }
  })
}

/** Task delete (no dialog): trash the task, keep + detach its direct entries. */
export async function deleteTaskWithDetach(
  db: DB,
  orgId: string,
  taskId: string
): Promise<DeleteResult> {
  return db.transaction(async tx => {
    await requireLive(tx, schema.tasks, orgId, taskId, 'Task')
    await tx.update(schema.tasks).set({ deletedAt: new Date() }).where(eq(schema.tasks.id, taskId))
    const detachedEntries = await detachEntries(tx, orgId, [], [], [taskId])
    return {
      deleted: { clients: [], projects: [], tasks: [taskId], entries: [] },
      detached: { projects: 0, tasks: 0, entries: detachedEntries }
    }
  })
}
