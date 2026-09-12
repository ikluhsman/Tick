// DELETE /api/tags/:id — strips the label from entries, never touches time.
// Implemented as a soft delete: entry_tags rows stay put, trashed tags are
// filtered from every read, so restoring the tag brings the labels back.
import { z } from 'zod'

export default defineEventHandler(async (event): Promise<TagDto> => {
  const user = await requireAuth(event)
  const id = z.uuid().parse(getRouterParam(event, 'id'))
  const db = useDrizzle()

  // Snapshot stats before the delete (for the undo toast).
  const ctx = await loadRateContext(db, user.orgId)
  const dto = (await buildTagDtos(db, user.orgId, ctx)).find(t => t.id === id)
  if (!dto) throw createError({ statusCode: 404, message: 'Tag not found' })

  await db
    .update(schema.tags)
    .set({ deletedAt: new Date() })
    .where(and(eq(schema.tags.id, id), eq(schema.tags.orgId, user.orgId)))
  return dto
})
