// GET /api/tags — TagDto[] with usage stats over live entries.
export default defineEventHandler(async (event): Promise<TagDto[]> => {
  const user = await requireAuth(event)
  const db = useDrizzle()
  return buildTagDtos(db, user.orgId)
})
