// POST /api/restore — undo: clear deleted_at on a DeleteResult snapshot's ids,
// then re-apply any cleared references from the `relinked` snapshot (cascade
// deletes detach kept rows; undo puts the refs back). Org-scoped.
// `tags` is accepted as an extension so tag deletes can be undone too.
import { z } from 'zod'

const bodySchema = z.object({
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

export default defineEventHandler(
  async (event): Promise<{ restored: Record<'clients' | 'projects' | 'tasks' | 'entries' | 'tags', number> }> => {
    const user = await requireAuth(event)
    const { deleted, relinked } = await readSanitizedBody(event, bodySchema)
    const db = useDrizzle()

    const restored = { clients: 0, projects: 0, tasks: 0, entries: 0, tags: 0 }
    await db.transaction(async tx => {
      const revive = async (
        table:
          | typeof schema.clients
          | typeof schema.projects
          | typeof schema.tasks
          | typeof schema.timeEntries
          | typeof schema.tags,
        ids: string[]
      ) => {
        if (!ids.length) return 0
        const rows = await tx
          .update(table)
          .set({ deletedAt: null })
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
      restored.clients = await revive(schema.clients, deleted.clients)
      restored.projects = await revive(schema.projects, deleted.projects)
      restored.tasks = await revive(schema.tasks, deleted.tasks)
      restored.entries = await revive(schema.timeEntries, deleted.entries)
      restored.tags = await revive(schema.tags, deleted.tags)

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
      for (const g of groupBy(relinked.projects, r => r.clientId)) {
        await tx
          .update(schema.projects)
          .set({ clientId: g.sample.clientId })
          .where(and(eq(schema.projects.orgId, user.orgId), inArray(schema.projects.id, g.ids)))
      }
      for (const g of groupBy(relinked.tasks, r => r.projectId)) {
        await tx
          .update(schema.tasks)
          .set({ projectId: g.sample.projectId })
          .where(and(eq(schema.tasks.orgId, user.orgId), inArray(schema.tasks.id, g.ids)))
      }
      for (const g of groupBy(relinked.entries, r => `${r.refType}:${r.refId}`)) {
        await tx
          .update(schema.timeEntries)
          .set({ refType: g.sample.refType, refId: g.sample.refId })
          .where(and(eq(schema.timeEntries.orgId, user.orgId), inArray(schema.timeEntries.id, g.ids)))
      }
    })
    return { restored }
  }
)
