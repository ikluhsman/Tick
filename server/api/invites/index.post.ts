// POST /api/invites — create an invite (owner/admin only). No email is sent
// (SMTP later); the UI shows a copyable /register?invite=TOKEN link instead.
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { InviteDto } from '~~/shared/types/settings'

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(254),
  role: z.enum(['owner', 'admin', 'member']).default('member')
})

const EXPIRY_DAYS = 7

export default defineEventHandler(async (event): Promise<InviteDto> => {
  const user = await requireAuth(event)
  if (user.role !== 'owner' && user.role !== 'admin') {
    throw createError({ statusCode: 403, message: 'Only owners and admins can invite members.' })
  }
  const body = await readValidatedBody(event, b => bodySchema.parse(b))
  const db = useDrizzle()

  const alreadyMember = await db
    .select({ userId: schema.orgMembers.userId })
    .from(schema.orgMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.orgMembers.userId))
    .where(and(eq(schema.orgMembers.orgId, user.orgId), eq(schema.users.email, body.email)))
    .limit(1)
  if (alreadyMember.length) {
    throw createError({ statusCode: 409, message: 'That person is already a member of this organization.' })
  }

  const [invite] = await db
    .insert(schema.invites)
    .values({
      orgId: user.orgId,
      email: body.email,
      role: body.role,
      token: randomBytes(24).toString('base64url'),
      expiresAt: new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000)
    })
    .returning()

  return {
    id: invite!.id,
    email: invite!.email,
    role: invite!.role as InviteDto['role'],
    token: invite!.token,
    expiresAt: invite!.expiresAt.toISOString(),
    createdAt: invite!.createdAt.toISOString()
  }
})
