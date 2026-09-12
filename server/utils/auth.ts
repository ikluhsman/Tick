// Session helper (CONTRACTS "Auth"): requireAuth(event) → SessionUser, throws 401 otherwise.
// SessionUser comes from shared/types (auto-imported).
import type { H3Event } from 'h3'

declare module '#auth-utils' {
  interface User extends SessionUser {}
}

export async function requireAuth(event: H3Event): Promise<SessionUser> {
  // requireUserSession throws 401 when no session cookie is present.
  const session = await requireUserSession(event)
  const user = session.user as SessionUser | undefined
  if (!user?.id || !user.orgId) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  // Never trust authorization data baked into the sealed cookie: sessions
  // cannot be revoked server-side (no session store), so the role — and the
  // membership itself — must be re-read live on every request. A removed
  // member loses access immediately; a demoted one loses privileges
  // immediately. Cache per-request in event.context for handlers that call
  // requireAuth more than once.
  const cached = event.context._tickLiveUser as SessionUser | undefined
  if (cached) return cached

  const db = useDrizzle()
  const membership = await db.query.orgMembers.findFirst({
    columns: { role: true },
    where: and(
      eq(schema.orgMembers.orgId, user.orgId),
      eq(schema.orgMembers.userId, user.id)
    )
  })
  if (!membership) {
    // Membership was revoked while the cookie was still valid — kill the session.
    await clearUserSession(event)
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const live: SessionUser = { ...user, role: membership.role as SessionUser['role'] }
  event.context._tickLiveUser = live
  return live
}
