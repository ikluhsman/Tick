// DELETE /api/org/members/:userId — remove a member from the org.
// Owner/admin only. The last owner can never be removed (409).
import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  if (user.role !== 'owner' && user.role !== 'admin') {
    throw createError({ statusCode: 403, message: 'Only owners and admins can manage members.' })
  }
  const userId = z.uuid().parse(getRouterParam(event, 'userId'))
  const db = useDrizzle()

  await db.transaction(async (tx) => {
    const target = await tx.query.orgMembers.findFirst({
      where: and(eq(schema.orgMembers.orgId, user.orgId), eq(schema.orgMembers.userId, userId))
    })
    if (!target) throw createError({ statusCode: 404, message: 'Member not found' })

    if (target.role === 'owner') {
      const [owners] = await tx
        .select({ n: count() })
        .from(schema.orgMembers)
        .where(and(eq(schema.orgMembers.orgId, user.orgId), eq(schema.orgMembers.role, 'owner')))
      if ((owners?.n ?? 0) <= 1) {
        throw createError({ statusCode: 409, message: 'An organization needs at least one owner.' })
      }
    }

    await tx
      .delete(schema.orgMembers)
      .where(and(eq(schema.orgMembers.orgId, user.orgId), eq(schema.orgMembers.userId, userId)))
  })

  return { ok: true }
})
