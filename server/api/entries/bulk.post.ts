// POST /api/entries/bulk — {ids, action:'delete'|'billable'|'restore', billable?}.
// delete → DeleteResult (undo snapshot); billable/restore → { count }.
import { z } from 'zod'

const bodySchema = z.object({
  ids: z.array(z.uuid()).min(1).max(500),
  action: z.enum(['delete', 'billable', 'restore']),
  billable: z.boolean().optional()
})

export default defineEventHandler(
  async (event): Promise<DeleteResult | { count: number }> => {
    const user = await requireAuth(event)
    const body = await readValidatedBody(event, b => bodySchema.parse(b))
    const db = useDrizzle()

    const own = and(
      eq(schema.timeEntries.orgId, user.orgId),
      eq(schema.timeEntries.userId, user.id),
      inArray(schema.timeEntries.id, body.ids)
    )

    if (body.action === 'delete') {
      const rows = await db
        .update(schema.timeEntries)
        .set({ deletedAt: new Date() })
        .where(and(own, isNull(schema.timeEntries.deletedAt), isNotNull(schema.timeEntries.end)))
        .returning({ id: schema.timeEntries.id })
      return {
        deleted: { clients: [], projects: [], tasks: [], entries: rows.map(r => r.id) },
        detached: { projects: 0, tasks: 0, entries: 0 }
      }
    }

    if (body.action === 'billable') {
      if (body.billable === undefined) {
        throw createError({ statusCode: 400, message: 'billable is required for this action' })
      }
      const rows = await db
        .update(schema.timeEntries)
        .set({ billable: body.billable })
        .where(and(own, isNull(schema.timeEntries.deletedAt)))
        .returning({ id: schema.timeEntries.id })
      return { count: rows.length }
    }

    // restore
    const rows = await db
      .update(schema.timeEntries)
      .set({ deletedAt: null })
      .where(and(own, isNotNull(schema.timeEntries.deletedAt)))
      .returning({ id: schema.timeEntries.id })
    return { count: rows.length }
  }
)
