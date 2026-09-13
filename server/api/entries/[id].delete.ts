// DELETE /api/entries/:id — Rule 4: soft-delete to trash, undo via /api/restore.

export default defineEventHandler(async (event): Promise<DeleteResult> => {
  const user = await requireAuth(event)
  const id = uuidRouterParam(event, 'id')
  const db = useDrizzle()

  const rows = await db
    .update(schema.timeEntries)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(schema.timeEntries.id, id),
        eq(schema.timeEntries.orgId, user.orgId),
        eq(schema.timeEntries.userId, user.id),
        isNull(schema.timeEntries.deletedAt),
        isNotNull(schema.timeEntries.end)
      )
    )
    .returning({ id: schema.timeEntries.id })
  if (!rows.length) throw createError({ statusCode: 404, message: 'Entry not found' })

  return {
    deleted: { clients: [], projects: [], tasks: [], entries: [id] },
    detached: { projects: 0, tasks: 0, entries: 0 }
  }
})
