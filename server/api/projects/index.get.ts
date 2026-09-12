// GET /api/projects — ProjectDto[] with resolved rate + source and task counts.
export default defineEventHandler(async (event): Promise<ProjectDto[]> => {
  const user = await requireAuth(event)
  const db = useDrizzle()
  const ctx = await loadRateContext(db, user.orgId)
  const agg = await loadOrgAggregates(db, user.orgId, ctx)
  return buildProjectDtos(ctx, agg, user.id)
})
