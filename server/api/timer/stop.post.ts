// POST /api/timer/stop — end the running entry. <1s elapsed = accidental tap:
// the row is discarded (hard delete) and null returned.
export default defineEventHandler(async (event): Promise<EntryDto | null> => {
  const user = await requireAuth(event)
  const db = useDrizzle()

  const [running] = await db
    .select()
    .from(schema.timeEntries)
    .where(
      and(
        eq(schema.timeEntries.orgId, user.orgId),
        eq(schema.timeEntries.userId, user.id),
        isNull(schema.timeEntries.end),
        isNull(schema.timeEntries.deletedAt)
      )
    )
    .limit(1)
  if (!running) throw createError({ statusCode: 404, message: 'No timer running.' })

  const end = new Date()
  if (end.getTime() - running.start.getTime() < 1000) {
    await db.delete(schema.timeEntries).where(eq(schema.timeEntries.id, running.id))
    return null
  }

  const [row] = await db
    .update(schema.timeEntries)
    .set({ end })
    .where(eq(schema.timeEntries.id, running.id))
    .returning()
  const ctx = await loadRateContext(db, user.orgId)
  const tags = await fetchTagsForEntries(db, [row!.id])
  return toEntryDto(row!, ctx, tags.get(row!.id) ?? [])
})
