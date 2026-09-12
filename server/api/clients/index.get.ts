// GET /api/clients — ClientDto[] with project/task counts + tracked/amount.
export default defineEventHandler(async (event): Promise<ClientDto[]> => {
  const user = await requireAuth(event)
  const db = useDrizzle()
  const ctx = await loadRateContext(db, user.orgId)
  const agg = await loadOrgAggregates(db, user.orgId, ctx)
  return buildClientDtos(ctx, agg)
})
