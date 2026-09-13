// DELETE /api/tasks/:id — trash the task; its direct entries are kept and
// detached (time is never lost silently). Returns the undo snapshot.

export default defineEventHandler(async (event): Promise<CascadeDeleteResult> => {
  const user = await requireAuth(event)
  const id = uuidRouterParam(event, 'id')
  const db = useDrizzle()
  return deleteTaskWithDetach(db, user.orgId, id)
})
