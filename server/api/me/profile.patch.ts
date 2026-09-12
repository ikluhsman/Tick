// PATCH /api/me/profile — update name / email / default rate. 409 on duplicate
// email. Session payload is refreshed so the sidebar footer updates immediately.
import { z } from 'zod'

const bodySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120).optional(),
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(254).optional(),
  defaultRate: z.number().min(0).max(100000).nullable().optional()
})

const DUPLICATE_MESSAGE = 'An account with that email already exists.'

export default defineEventHandler(async (event): Promise<SessionUser> => {
  const user = await requireAuth(event)
  const body = await readValidatedBody(event, b => bodySchema.parse(b))
  const db = useDrizzle()

  if (body.email) {
    const existing = await db.query.users.findFirst({
      columns: { id: true },
      where: eq(schema.users.email, body.email)
    })
    if (existing && existing.id !== user.id) {
      throw createError({ statusCode: 409, message: DUPLICATE_MESSAGE })
    }
  }

  const patch: Partial<typeof schema.users.$inferInsert> = {}
  if (body.name !== undefined) patch.name = body.name
  if (body.email !== undefined) patch.email = body.email
  if (body.defaultRate !== undefined) patch.defaultRate = body.defaultRate

  if (Object.keys(patch).length) {
    try {
      await db.update(schema.users).set(patch).where(eq(schema.users.id, user.id))
    } catch (err) {
      // Race with a concurrent register/update on the same email.
      let current: unknown = err
      for (let depth = 0; current && depth < 5; depth++) {
        if ((current as { code?: string }).code === '23505') {
          throw createError({ statusCode: 409, message: DUPLICATE_MESSAGE })
        }
        current = (current as { cause?: unknown }).cause
      }
      throw err
    }
  }

  const sessionUser: SessionUser = {
    ...user,
    name: body.name ?? user.name,
    email: body.email ?? user.email,
    defaultRate: body.defaultRate !== undefined ? body.defaultRate : user.defaultRate
  }
  await setUserSession(event, { user: sessionUser })
  return sessionUser
})
