// GET /api/tasks — TaskDto[] (project/client names derived, entry counts).
export default defineEventHandler(async (event): Promise<TaskDto[]> => {
  const user = await requireAuth(event)
  const db = useDrizzle()
  const ctxQ = loadRateContext(db, user.orgId)
  const [ctx, agg] = await Promise.all([ctxQ, loadOrgAggregates(db, user.orgId, ctxQ)])
  return buildTaskDtos(ctx, agg, user.id)
})
