// GET /api/clients — ClientDto[] with project/task counts + tracked/amount.
export default defineEventHandler(async (event): Promise<ClientDto[]> => {
  const user = await requireAuth(event)
  const db = useDrizzle()
  const ctxQ = loadRateContext(db, user.orgId)
  const [ctx, agg] = await Promise.all([ctxQ, loadOrgAggregates(db, user.orgId, ctxQ)])
  return buildClientDtos(ctx, agg)
})
