// POST /api/trash/purge — hard-delete trashed rows ("Delete forever").
// Body: { all: true } empties the trash, or { items: { entity: ids[] } }.
// Only rows already in trash (deleted_at set) are touched; entries go first
// for FK safety.
import { z } from 'zod'
import type { TrashEntity } from '~~/shared/types/settings'

const bodySchema = z.object({
  all: z.boolean().default(false),
  items: z
    .object({
      clients: z.array(z.uuid()).max(1000).default([]),
      projects: z.array(z.uuid()).max(1000).default([]),
      tasks: z.array(z.uuid()).max(5000).default([]),
      tags: z.array(z.uuid()).max(1000).default([]),
      entries: z.array(z.uuid()).max(10000).default([])
    })
    .default({ clients: [], projects: [], tasks: [], tags: [], entries: [] })
})

export default defineEventHandler(
  async (event): Promise<{ purged: Record<TrashEntity, number> }> => {
    const user = await requireAuth(event)
    const body = await readValidatedBody(event, b => bodySchema.parse(b))
    const db = useDrizzle()

    const purged: Record<TrashEntity, number> = {
      clients: 0,
      projects: 0,
      tasks: 0,
      tags: 0,
      entries: 0
    }

    await db.transaction(async (tx) => {
      const wipe = async (
        table:
          | typeof schema.timeEntries
          | typeof schema.tasks
          | typeof schema.projects
          | typeof schema.clients
          | typeof schema.tags,
        ids: string[]
      ) => {
        if (!body.all && !ids.length) return 0
        const rows = await tx
          .delete(table)
          .where(
            and(
              eq(table.orgId, user.orgId),
              isNotNull(table.deletedAt),
              body.all ? undefined : inArray(table.id, ids)
            )
          )
          .returning({ id: table.id })
        return rows.length
      }
      // Entries first (entry_tags cascade), then the catalog top-down.
      purged.entries = await wipe(schema.timeEntries, body.items.entries)
      purged.tasks = await wipe(schema.tasks, body.items.tasks)
      purged.projects = await wipe(schema.projects, body.items.projects)
      purged.clients = await wipe(schema.clients, body.items.clients)
      purged.tags = await wipe(schema.tags, body.items.tags)
    })

    return { purged }
  }
)
