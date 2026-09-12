// GET /api/org/members — all members of the current org (any role can view).
import type { OrgMemberDto } from '~~/shared/types/settings'

export default defineEventHandler(async (event): Promise<OrgMemberDto[]> => {
  const user = await requireAuth(event)
  const db = useDrizzle()

  const rows = await db
    .select({
      userId: schema.orgMembers.userId,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.orgMembers.role,
      rate: schema.orgMembers.rate,
      defaultRate: schema.users.defaultRate
    })
    .from(schema.orgMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.orgMembers.userId))
    .where(eq(schema.orgMembers.orgId, user.orgId))
    .orderBy(
      sql`case ${schema.orgMembers.role} when 'owner' then 0 when 'admin' then 1 else 2 end`,
      asc(schema.users.name)
    )

  return rows.map(r => ({
    userId: r.userId,
    name: r.name,
    email: r.email,
    role: r.role as OrgMemberDto['role'],
    rate: r.rate,
    defaultRate: r.defaultRate
  }))
})
