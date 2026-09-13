// GET /api/projects — ProjectDto[] with resolved rate + source and task counts.
export default defineEventHandler(async (event): Promise<ProjectDto[]> => {
  const user = await requireAuth(event)
  const db = useDrizzle()
  const ctxQ = loadRateContext(db, user.orgId)
  const [ctx, agg] = await Promise.all([ctxQ, loadOrgAggregates(db, user.orgId, ctxQ)])
  return buildProjectDtos(ctx, agg, user.id)
})
