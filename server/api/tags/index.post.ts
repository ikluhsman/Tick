// POST /api/tags — {name}: lowercased, '#' stripped, deduped (existing tag is
// returned as-is; a trashed name match is revived). → TagDto
import { z } from 'zod'

const bodySchema = z.object({ name: z.string().trim().min(1).max(100) })

export default defineEventHandler(async (event): Promise<TagDto> => {
  const user = await requireAuth(event)
  const body = await readSanitizedBody(event, bodySchema)
  const db = useDrizzle()

  const name = normalizeTagName(body.name)
  if (!name) throw createError({ statusCode: 400, message: 'Tag name is empty' })

  const [tag] = await ensureTags(db, user.orgId, [name])
  if (!tag) throw createError({ statusCode: 400, message: 'Tag name is empty' })

  const [dto] = await buildTagDtos(db, user.orgId, tag.id)
  if (!dto) throw createError({ statusCode: 500, message: 'Tag creation failed' })
  return dto
})
