// GET /api/tags — TagDto[] with usage stats over live entries.
export default defineEventHandler(async (event): Promise<TagDto[]> => {
  const user = await requireAuth(event)
  const db = useDrizzle()
  const ctx = await loadRateContext(db, user.orgId)
  return buildTagDtos(db, user.orgId, ctx)
})
