// DELETE /api/org/members/:userId — remove a member from the org.
// Owner/admin only. The last owner can never be removed (409).

export default defineEventHandler(async (event) => {
  demoGuard(event) // 403 in demo mode
  const user = await requireAuth(event)
  if (user.role !== 'owner' && user.role !== 'admin') {
    throw createError({ statusCode: 403, message: 'Only owners and admins can manage members.' })
  }
  const userId = uuidRouterParam(event, 'userId')
  const db = useDrizzle()

  await db.transaction(async (tx) => {
    const target = await tx.query.orgMembers.findFirst({
      where: and(eq(schema.orgMembers.orgId, user.orgId), eq(schema.orgMembers.userId, userId))
    })
    if (!target) throw createError({ statusCode: 404, message: 'Member not found' })

    // Admins may remove members/admins but never owners.
    if (user.role === 'admin' && target.role === 'owner') {
      throw createError({ statusCode: 403, message: 'Only owners can remove owner accounts.' })
    }

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
