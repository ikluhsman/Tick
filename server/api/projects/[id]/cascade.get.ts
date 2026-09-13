// GET /api/projects/:id/cascade — counts for the cascade-delete dialog.

export default defineEventHandler(async (event): Promise<CascadeCounts> => {
  const user = await requireAuth(event)
  const id = uuidRouterParam(event, 'id')
  const db = useDrizzle()
  return projectCascadeCounts(db, user.orgId, id)
})
