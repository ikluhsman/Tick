// GET /api/timer — the running entry (end IS NULL) as TimerState, or null.
export default defineEventHandler(async (event): Promise<TimerState | null> => {
  const user = await requireAuth(event)
  const db = useDrizzle()
  const [row] = await db
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
  if (!row) return null
  const ctx = await loadRateContext(db, user.orgId)
  return toTimerState(row, ctx)
})
