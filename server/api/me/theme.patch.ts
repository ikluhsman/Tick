// PATCH /api/me/theme — persist the theme editor state to users.theme (jsonb).
import { z } from 'zod'

const bodySchema = z.object({
  theme: z.record(z.string(), z.unknown())
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readValidatedBody(event, b => bodySchema.parse(b))

  await useDrizzle()
    .update(schema.users)
    .set({ theme: body.theme })
    .where(eq(schema.users.id, user.id))

  return { ok: true }
})
