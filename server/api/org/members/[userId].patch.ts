// PATCH /api/org/members/:userId — change a member's role or rate override.
// Owner/admin only. The last owner can never be demoted (409).
import { z } from 'zod'
import type { OrgMemberDto } from '~~/shared/types/settings'

const bodySchema = z.object({
  role: z.enum(['owner', 'admin', 'member']).optional(),
  rate: z.number().min(0).max(100000).nullable().optional()
})

export default defineEventHandler(async (event): Promise<OrgMemberDto> => {
  const user = await requireAuth(event)
  if (user.role !== 'owner' && user.role !== 'admin') {
    throw createError({ statusCode: 403, message: 'Only owners and admins can manage members.' })
  }
  const userId = z.uuid().parse(getRouterParam(event, 'userId'))
  const body = await readValidatedBody(event, b => bodySchema.parse(b))
  const db = useDrizzle()

  const updated = await db.transaction(async (tx) => {
    const target = await tx.query.orgMembers.findFirst({
      where: and(eq(schema.orgMembers.orgId, user.orgId), eq(schema.orgMembers.userId, userId))
    })
    if (!target) throw createError({ statusCode: 404, message: 'Member not found' })

    // Admins may manage members/admins but never touch owners, and may not
    // grant a role above their own (no owner escalation, no owner demotion).
    if (user.role === 'admin') {
      if (target.role === 'owner') {
        throw createError({ statusCode: 403, message: 'Only owners can manage owner accounts.' })
      }
      if (body.role === 'owner') {
        throw createError({ statusCode: 403, message: 'Only owners can grant the owner role.' })
      }
    }

    if (body.role !== undefined && body.role !== 'owner' && target.role === 'owner') {
      const [owners] = await tx
        .select({ n: count() })
        .from(schema.orgMembers)
        .where(and(eq(schema.orgMembers.orgId, user.orgId), eq(schema.orgMembers.role, 'owner')))
      if ((owners?.n ?? 0) <= 1) {
        throw createError({ statusCode: 409, message: 'An organization needs at least one owner.' })
      }
    }

    const patch: Partial<typeof schema.orgMembers.$inferInsert> = {}
    if (body.role !== undefined) patch.role = body.role
    if (body.rate !== undefined) patch.rate = body.rate
    if (!Object.keys(patch).length) return target

    const [row] = await tx
      .update(schema.orgMembers)
      .set(patch)
      .where(and(eq(schema.orgMembers.orgId, user.orgId), eq(schema.orgMembers.userId, userId)))
      .returning()
    return row!
  })

  const person = await db.query.users.findFirst({
    columns: { name: true, email: true, defaultRate: true },
    where: eq(schema.users.id, userId)
  })

  return {
    userId,
    name: person?.name ?? '',
    email: person?.email ?? '',
    role: updated.role as OrgMemberDto['role'],
    rate: updated.rate,
    defaultRate: person?.defaultRate ?? null
  }
})
