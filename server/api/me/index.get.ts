// GET /api/me — SessionUser fresh from the DB (+ saved theme so the client can apply it on login).
export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const db = useDrizzle()

  const [row] = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      defaultRate: schema.users.defaultRate,
      theme: schema.users.theme,
      orgId: schema.orgs.id,
      orgName: schema.orgs.name,
      role: schema.orgMembers.role
    })
    .from(schema.users)
    .innerJoin(schema.orgMembers, eq(schema.orgMembers.userId, schema.users.id))
    .innerJoin(schema.orgs, eq(schema.orgs.id, schema.orgMembers.orgId))
    .where(and(eq(schema.users.id, session.id), eq(schema.orgMembers.orgId, session.orgId)))
    .limit(1)
  if (!row) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const user: SessionUser = {
    id: row.id,
    name: row.name,
    email: row.email,
    defaultRate: row.defaultRate,
    orgId: row.orgId,
    orgName: row.orgName,
    role: row.role as SessionUser['role']
  }
  // Keep the session payload in step with the DB (e.g. after a profile edit).
  await setUserSession(event, { user })

  return { ...user, theme: (row.theme ?? null) as Record<string, unknown> | null }
})
