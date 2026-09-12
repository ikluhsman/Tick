// POST /api/auth/login — verify credentials, set session. Generic 401 on wrong creds.
import { z } from 'zod'

const bodySchema = z.object({
  // Deliberately lenient: format problems must not leak which part was wrong.
  email: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1)
})

// Verified against when the email is unknown, so response time doesn't reveal
// whether an account exists.
const DUMMY_HASH = hashPassword('tick-timing-equalizer')

export default defineEventHandler(async (event): Promise<SessionUser> => {
  const body = await readValidatedBody(event, b => bodySchema.parse(b))
  const db = useDrizzle()

  const invalid = () => createError({ statusCode: 401, message: 'Invalid email or password.' })

  const user = await db.query.users.findFirst({
    where: eq(schema.users.email, body.email)
  })
  const passwordOk = verifyPassword(body.password, user?.passwordHash ?? DUMMY_HASH)
  if (!user || !passwordOk) throw invalid()

  const [membership] = await db
    .select({
      orgId: schema.orgMembers.orgId,
      role: schema.orgMembers.role,
      orgName: schema.orgs.name
    })
    .from(schema.orgMembers)
    .innerJoin(schema.orgs, eq(schema.orgs.id, schema.orgMembers.orgId))
    .where(eq(schema.orgMembers.userId, user.id))
    .orderBy(
      sql`case ${schema.orgMembers.role} when 'owner' then 0 when 'admin' then 1 else 2 end`
    )
    .limit(1)
  if (!membership) throw invalid() // account without a workspace is unusable

  const sessionUser: SessionUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    defaultRate: user.defaultRate,
    orgId: membership.orgId,
    orgName: membership.orgName,
    role: membership.role as SessionUser['role']
  }
  await setUserSession(event, { user: sessionUser })
  return sessionUser
})
