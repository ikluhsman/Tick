// GET /api/tasks — TaskDto[] (project/client names derived, entry counts).
export default defineEventHandler(async (event): Promise<TaskDto[]> => {
  const user = await requireAuth(event)
  const db = useDrizzle()
  const ctx = await loadRateContext(db, user.orgId)
  const agg = await loadOrgAggregates(db, user.orgId, ctx)
  return buildTaskDtos(ctx, agg)
})
