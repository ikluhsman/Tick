// Session helper (CONTRACTS "Auth"): requireAuth(event) → SessionUser, throws 401 otherwise.
// SessionUser comes from shared/types (auto-imported).
import type { H3Event } from 'h3'

declare module '#auth-utils' {
  interface User extends SessionUser {}
  interface UserSession {
    /**
     * users.session_version at login time. requireAuth compares it against the
     * live DB value; password reset/change bumps the DB value, revoking every
     * session stamped with an older one. Absent on pre-feature sessions —
     * treated as 0 (the column default), so they stay valid until a bump.
     */
    sessionVersion?: number
  }
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
  const [membership] = await db
    .select({
      role: schema.orgMembers.role,
      sessionVersion: schema.users.sessionVersion
    })
    .from(schema.orgMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.orgMembers.userId))
    .where(
      and(
        eq(schema.orgMembers.orgId, user.orgId),
        eq(schema.orgMembers.userId, user.id)
      )
    )
    .limit(1)
  if (!membership) {
    // Membership was revoked while the cookie was still valid — kill the session.
    await clearUserSession(event)
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }
  // Session revocation: a password reset/change bumps users.session_version,
  // so any cookie stamped with an older version dies here.
  if (membership.sessionVersion !== (session.sessionVersion ?? 0)) {
    await clearUserSession(event)
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const live: SessionUser = { ...user, role: membership.role as SessionUser['role'] }
  event.context._tickLiveUser = live
  return live
}
