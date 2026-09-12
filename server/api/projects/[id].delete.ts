// DELETE /api/projects/:id — Rule 3 cascade (tasks ⇒ entries). Returns undo snapshot.
import { z } from 'zod'

const bodySchema = z.object({
  cascadeTasks: z.boolean().default(false),
  cascadeEntries: z.boolean().default(false)
})

export default defineEventHandler(async (event): Promise<CascadeDeleteResult> => {
  const user = await requireAuth(event)
  const id = z.uuid().parse(getRouterParam(event, 'id'))
  const flags = bodySchema.parse((await readBody(event).catch(() => null)) ?? {})
  const db = useDrizzle()
  return cascadeDeleteProject(db, user.orgId, id, flags)
})
