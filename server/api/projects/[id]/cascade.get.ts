// GET /api/projects/:id/cascade — counts for the cascade-delete dialog.
import { z } from 'zod'

export default defineEventHandler(async (event): Promise<CascadeCounts> => {
  const user = await requireAuth(event)
  const id = z.uuid().parse(getRouterParam(event, 'id'))
  const db = useDrizzle()
  return projectCascadeCounts(db, user.orgId, id)
})
