// POST /api/restore — undo. Two shapes, both org-scoped:
//
//   { batchId }            one cascade delete, recorded server-side
//   { deleted, relinked }  an explicit id snapshot
//
// The snapshot form is what the trash list, a tag delete and a single-entry
// undo send: small, known id sets the client already has. A cascade cannot use
// it — a busy client's history runs past both the per-array caps below and the
// 1MB body limit (roughly 27k uuids), so undo silently restored nothing
// (ticktimer/Tick#11). Those deletes stamp every row they trash with a
// delete_batches id and store their relink snapshot against it, so undo names
// the operation instead of listing it.
import { z } from 'zod'

const batchSchema = z.object({ batchId: z.uuid() })

const snapshotSchema = z.object({
  deleted: z.object({
    clients: z.array(z.uuid()).max(1000).default([]),
    projects: z.array(z.uuid()).max(1000).default([]),
    tasks: z.array(z.uuid()).max(5000).default([]),
    entries: z.array(z.uuid()).max(10000).default([]),
    tags: z.array(z.uuid()).max(1000).default([])
  }),
  // RelinkSnapshot (server/utils/cascade.ts) — detach ops to reverse on undo.
  relinked: z.object({
    projects: z.array(z.object({ id: z.uuid(), clientId: z.uuid() })).max(1000).default([]),
    tasks: z.array(z.object({ id: z.uuid(), projectId: z.uuid() })).max(5000).default([]),
    entries: z.array(z.object({
      id: z.uuid(),
      refType: z.enum(['client', 'project', 'task']),
      refId: z.uuid()
    })).max(10000).default([])
  }).default({ projects: [], tasks: [], entries: [] })
})

const bodySchema = z.union([batchSchema, snapshotSchema])

/** The relink snapshot as stored in delete_batches.relinked. */
const storedRelinkSchema = z.object({
  projects: z.array(z.object({ id: z.uuid(), clientId: z.uuid() })).default([]),
  tasks: z.array(z.object({ id: z.uuid(), projectId: z.uuid() })).default([]),
  entries: z.array(z.object({
    id: z.uuid(),
    refType: z.enum(['client', 'project', 'task']),
    refId: z.uuid()
  })).default([])
})

export default defineEventHandler(
  async (event): Promise<{ restored: Record<'clients' | 'projects' | 'tasks' | 'entries' | 'tags', number> }> => {
    const user = await requireAuth(event)
    const body = await readSanitizedBody(event, bodySchema)
    const db = useDrizzle()

    /** Tables a cascade can stamp; tags is handled on its own (no stamp). */
    type BatchTable =
      | typeof schema.clients
      | typeof schema.projects
      | typeof schema.tasks
      | typeof schema.timeEntries

    const restored = { clients: 0, projects: 0, tasks: 0, entries: 0, tags: 0 }
    await db.transaction(async tx => {
      /**
       * Un-trash the given ids. Only rows of this org that are actually trashed.
       * The batch stamp goes with the deleted_at: a row that is alive again must
       * not be caught by a later undo of the cascade that once trashed it.
       */
      const revive = async (table: BatchTable, ids: string[]) => {
        if (!ids.length) return 0
        const rows = await tx
          .update(table)
          .set({ deletedAt: null, deleteBatchId: null })
          .where(
            and(
              eq(table.orgId, user.orgId),
              inArray(table.id, ids),
              isNotNull(table.deletedAt)
            )
          )
          .returning({ id: table.id })
        return rows.length
      }

      /**
       * Un-trash everything one cascade stamped. No id list crosses the wire or
       * the parameter limit, however large the batch was.
       */
      const reviveBatch = async (table: BatchTable, batchId: string) => {
        const rows = await tx
          .update(table)
          .set({ deletedAt: null, deleteBatchId: null })
          .where(
            and(
              eq(table.orgId, user.orgId),
              eq(table.deleteBatchId, batchId),
              isNotNull(table.deletedAt)
            )
          )
          .returning({ id: table.id })
        return rows.length
      }

      let relinked: RelinkSnapshot
      if ('batchId' in body) {
        const [batch] = await tx
          .select({ relinked: schema.deleteBatches.relinked })
          .from(schema.deleteBatches)
          .where(
            and(
              eq(schema.deleteBatches.id, body.batchId),
              eq(schema.deleteBatches.orgId, user.orgId)
            )
          )
          .limit(1)
        // Org-scoped: another org's batch is indistinguishable from a wrong id.
        if (!batch) throw createError({ statusCode: 404, message: 'Delete batch not found' })
        relinked = storedRelinkSchema.parse(batch.relinked)

        restored.clients = await reviveBatch(schema.clients, body.batchId)
        restored.projects = await reviveBatch(schema.projects, body.batchId)
        restored.tasks = await reviveBatch(schema.tasks, body.batchId)
        restored.entries = await reviveBatch(schema.timeEntries, body.batchId)
        // A cascade never trashes tags; a tag delete sends the snapshot form.
      } else {
        relinked = body.relinked
        restored.clients = await revive(schema.clients, body.deleted.clients)
        restored.projects = await revive(schema.projects, body.deleted.projects)
        restored.tasks = await revive(schema.tasks, body.deleted.tasks)
        restored.entries = await revive(schema.timeEntries, body.deleted.entries)
        // Tags carry no batch stamp — a cascade never trashes one.
        if (body.deleted.tags.length) {
          const rows = await tx
            .update(schema.tags)
            .set({ deletedAt: null })
            .where(
              and(
                eq(schema.tags.orgId, user.orgId),
                inArray(schema.tags.id, body.deleted.tags),
                isNotNull(schema.tags.deletedAt)
              )
            )
            .returning({ id: schema.tags.id })
          restored.tags = rows.length
        }
      }

      // Re-attach rows the cascade detached, grouped per target to batch updates.
      const groupBy = <T extends { id: string }>(rows: T[], key: (r: T) => string) => {
        const m = new Map<string, { sample: T, ids: string[] }>()
        for (const r of rows) {
          const k = key(r)
          const g = m.get(k)
          if (g) g.ids.push(r.id)
          else m.set(k, { sample: r, ids: [r.id] })
        }
        return [...m.values()]
      }
      // inUuids, not inArray: a batch's detached entries are unbounded, and
      // inArray binds one parameter per id (Postgres stops at 65,535).
      for (const g of groupBy(relinked.projects, r => r.clientId)) {
        await tx
          .update(schema.projects)
          .set({ clientId: g.sample.clientId })
          .where(and(eq(schema.projects.orgId, user.orgId), inUuids(schema.projects.id, g.ids)))
      }
      for (const g of groupBy(relinked.tasks, r => r.projectId)) {
        await tx
          .update(schema.tasks)
          .set({ projectId: g.sample.projectId })
          .where(and(eq(schema.tasks.orgId, user.orgId), inUuids(schema.tasks.id, g.ids)))
      }
      for (const g of groupBy(relinked.entries, r => `${r.refType}:${r.refId}`)) {
        await tx
          .update(schema.timeEntries)
          .set({ refType: g.sample.refType, refId: g.sample.refId })
          .where(and(eq(schema.timeEntries.orgId, user.orgId), inUuids(schema.timeEntries.id, g.ids)))
      }
    })
    return { restored }
  }
)
