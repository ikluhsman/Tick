// GET /api/invites — pending (unaccepted, unexpired) invites for the org.
// Owner/admin only, since tokens grant membership.
import type { InviteDto } from '~~/shared/types/settings'

export default defineEventHandler(async (event): Promise<InviteDto[]> => {
  const user = await requireAuth(event)
  if (user.role !== 'owner' && user.role !== 'admin') {
    throw createError({ statusCode: 403, message: 'Only owners and admins can view invites.' })
  }
  const db = useDrizzle()

  const rows = await db
    .select()
    .from(schema.invites)
    .where(
      and(
        eq(schema.invites.orgId, user.orgId),
        isNull(schema.invites.acceptedAt),
        gt(schema.invites.expiresAt, new Date())
      )
    )
    .orderBy(desc(schema.invites.createdAt))

  return rows.map(r => ({
    id: r.id,
    email: r.email,
    role: r.role as InviteDto['role'],
    token: r.token,
    expiresAt: r.expiresAt.toISOString(),
    createdAt: r.createdAt.toISOString()
  }))
})
