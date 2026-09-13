// PATCH /api/me/password — change password after verifying the current one.
// Generic 403 on a wrong current password (no detail leak).
import { z } from 'zod'

const bodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(200)
})

export default defineEventHandler(async (event) => {
  demoGuard(event) // 403 in demo mode
  const user = await requireAuth(event)
  const body = await readValidatedBody(event, b => bodySchema.parse(b))
  const db = useDrizzle()

  const row = await db.query.users.findFirst({
    columns: { passwordHash: true },
    where: eq(schema.users.id, user.id)
  })
  if (!row || !verifyPassword(body.currentPassword, row.passwordHash)) {
    throw createError({ statusCode: 403, message: 'Current password is incorrect.' })
  }

  const [updated] = await db
    .update(schema.users)
    .set({
      passwordHash: hashPassword(body.newPassword),
      // Revoke every other session (requireAuth compares this stamp)…
      sessionVersion: sql`${schema.users.sessionVersion} + 1`
    })
    .where(eq(schema.users.id, user.id))
    .returning({ sessionVersion: schema.users.sessionVersion })

  // …but keep THIS session alive by re-stamping it with the new version.
  await setUserSession(event, { sessionVersion: updated!.sessionVersion })

  return { ok: true }
})
