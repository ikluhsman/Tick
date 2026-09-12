// POST /api/auth/reset {token, password} — finish a password reset.
// Valid = token exists, unused, unexpired → 410 otherwise (page tells the user
// to request a fresh link). On success: hash + store the new password, mark the
// token used, and void the user's other outstanding tokens. Existing sessions
// stay valid: nuxt-auth-utils sessions are sealed cookies with no server-side
// store, so they can't be revoked here — they simply expire on their own.
import { z } from 'zod'
import { hashPassword } from '../../utils/password'
import type { ResetResponseDto } from '~~/shared/types/mail'

const bodySchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200)
})

export default defineEventHandler(async (event): Promise<ResetResponseDto> => {
  const body = await readValidatedBody(event, b => bodySchema.parse(b))
  const db = useDrizzle()

  const row = await db.query.passwordResetTokens.findFirst({
    where: eq(schema.passwordResetTokens.token, body.token)
  })
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
    throw createError({
      statusCode: 410,
      message: 'This reset link is invalid or has expired. Request a new one.'
    })
  }

  const now = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(schema.users)
      .set({ passwordHash: hashPassword(body.password) })
      .where(eq(schema.users.id, row.userId))
    // Mark this token used and void any other outstanding tokens for the user.
    await tx
      .update(schema.passwordResetTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(schema.passwordResetTokens.userId, row.userId),
          isNull(schema.passwordResetTokens.usedAt)
        )
      )
  })

  return { ok: true }
})
