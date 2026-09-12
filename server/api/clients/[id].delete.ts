// DELETE /api/clients/:id — README Rule 3 cascade. Body flags say which levels
// go to trash; unchecked levels are kept + detached. Returns the undo snapshot.
import { z } from 'zod'

const bodySchema = z.object({
  cascadeProjects: z.boolean().default(false),
  cascadeTasks: z.boolean().default(false),
  cascadeEntries: z.boolean().default(false)
})

export default defineEventHandler(async (event): Promise<CascadeDeleteResult> => {
  const user = await requireAuth(event)
  const id = z.uuid().parse(getRouterParam(event, 'id'))
  const flags = bodySchema.parse((await readBody(event).catch(() => null)) ?? {})
  const db = useDrizzle()
  return cascadeDeleteClient(db, user.orgId, id, flags)
})
