// DELETE /api/tasks/:id — trash the task; its direct entries are kept and
// detached (time is never lost silently). Returns the undo snapshot.
import { z } from 'zod'

export default defineEventHandler(async (event): Promise<DeleteResult> => {
  const user = await requireAuth(event)
  const id = z.uuid().parse(getRouterParam(event, 'id'))
  const db = useDrizzle()
  return deleteTaskWithDetach(db, user.orgId, id)
})
