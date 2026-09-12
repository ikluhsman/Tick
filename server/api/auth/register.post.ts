// POST /api/auth/register — create user + personal org (owner) + session. 409 on duplicate email.
import { z } from 'zod'

const bodySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(254),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  /** From /register?invite=TOKEN — join that org with the invite's role instead of creating one. */
  inviteToken: z.string().min(1).max(200).optional()
})

const DUPLICATE_MESSAGE = 'An account with that email already exists.'

function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err
  for (let depth = 0; current && depth < 5; depth++) {
    if ((current as { code?: string }).code === '23505') return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}

export default defineEventHandler(async (event): Promise<SessionUser> => {
  const body = await readValidatedBody(event, b => bodySchema.parse(b))
  const db = useDrizzle()

  const existing = await db.query.users.findFirst({
    columns: { id: true },
    where: eq(schema.users.email, body.email)
  })
  if (existing) {
    throw createError({ statusCode: 409, message: DUPLICATE_MESSAGE })
  }

  const firstName = body.name.split(/\s+/)[0] ?? body.name
  let sessionUser: SessionUser
  try {
    sessionUser = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(schema.users)
        .values({
          name: body.name,
          email: body.email,
          passwordHash: hashPassword(body.password)
        })
        .returning()

      if (body.inviteToken) {
        // Invited: join the inviting org with the invite's role. 410 if the
        // token is unknown, expired or already used.
        const invite = await tx.query.invites.findFirst({
          where: eq(schema.invites.token, body.inviteToken)
        })
        if (!invite || invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) {
          throw createError({ statusCode: 410, message: 'This invite has expired or was already used.' })
        }
        const [org] = await tx
          .select()
          .from(schema.orgs)
          .where(eq(schema.orgs.id, invite.orgId))
          .limit(1)
        if (!org) {
          throw createError({ statusCode: 410, message: 'This invite has expired or was already used.' })
        }
        await tx.insert(schema.orgMembers).values({
          orgId: invite.orgId,
          userId: user!.id,
          role: invite.role
        })
        await tx
          .update(schema.invites)
          .set({ acceptedAt: new Date() })
          .where(eq(schema.invites.id, invite.id))
        return {
          id: user!.id,
          name: user!.name,
          email: user!.email,
          defaultRate: user!.defaultRate,
          orgId: invite.orgId,
          orgName: org.name,
          role: invite.role as SessionUser['role']
        }
      }

      const [org] = await tx
        .insert(schema.orgs)
        .values({ name: `${firstName}'s workspace` })
        .returning()
      await tx.insert(schema.orgMembers).values({
        orgId: org!.id,
        userId: user!.id,
        role: 'owner'
      })
      return {
        id: user!.id,
        name: user!.name,
        email: user!.email,
        defaultRate: user!.defaultRate,
        orgId: org!.id,
        orgName: org!.name,
        role: 'owner' as const
      }
    })
  } catch (err) {
    // Race with a concurrent register on the same email.
    if (isUniqueViolation(err)) {
      throw createError({ statusCode: 409, message: DUPLICATE_MESSAGE })
    }
    throw err
  }

  await setUserSession(event, { user: sessionUser })
  return sessionUser
})
