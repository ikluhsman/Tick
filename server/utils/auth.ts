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
  return user
}
