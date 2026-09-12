// POST /api/restore — undo: clear deleted_at on a DeleteResult snapshot's ids.
// Org-scoped; detached rows stay detached (refs were cleared, not remembered).
// `tags` is accepted as an extension so tag deletes can be undone too.
import { z } from 'zod'

const bodySchema = z.object({
  deleted: z.object({
    clients: z.array(z.uuid()).max(1000).default([]),
    projects: z.array(z.uuid()).max(1000).default([]),
    tasks: z.array(z.uuid()).max(5000).default([]),
    entries: z.array(z.uuid()).max(10000).default([]),
    tags: z.array(z.uuid()).max(1000).default([])
  })
})

export default defineEventHandler(
  async (event): Promise<{ restored: Record<'clients' | 'projects' | 'tasks' | 'entries' | 'tags', number> }> => {
    const user = await requireAuth(event)
    const { deleted } = await readValidatedBody(event, b => bodySchema.parse(b))
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
    })
    return { restored }
  }
)
