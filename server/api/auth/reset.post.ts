// POST /api/auth/reset {token, password} — finish a password reset.
// Valid = token exists, unused, unexpired → 410 otherwise (page tells the user
// to request a fresh link). On success: hash + store the new password, mark the
// token used, void the user's other outstanding tokens, and bump
// users.session_version — requireAuth compares that against the version
// stamped into each sealed session cookie, so every existing session is
// revoked on its next request (see server/utils/auth.ts).
import { z } from 'zod'
import { hashPassword } from '../../utils/password'
import type { ResetResponseDto } from '~~/shared/types/mail'

const bodySchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200)
})

export default defineEventHandler(async (event): Promise<ResetResponseDto> => {
  // Sanitized validation: unauth-reachable, must not echo zod internals.
  const body = await readSanitizedBody(event, bodySchema)
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
      .set({
        passwordHash: hashPassword(body.password),
        // Revoke every existing session (requireAuth compares this stamp).
        sessionVersion: sql`${schema.users.sessionVersion} + 1`
      })
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
