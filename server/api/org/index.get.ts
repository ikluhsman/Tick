// GET /api/org — current org info + member count.
import type { OrgInfoDto } from '~~/shared/types/settings'

export default defineEventHandler(async (event): Promise<OrgInfoDto> => {
  const user = await requireAuth(event)
  const db = useDrizzle()

  const [row] = await db
    .select({
      id: schema.orgs.id,
      name: schema.orgs.name,
      createdAt: schema.orgs.createdAt,
      memberCount: count(schema.orgMembers.userId)
    })
    .from(schema.orgs)
    .innerJoin(schema.orgMembers, eq(schema.orgMembers.orgId, schema.orgs.id))
    .where(eq(schema.orgs.id, user.orgId))
    .groupBy(schema.orgs.id)
  if (!row) throw createError({ statusCode: 404, message: 'Organization not found' })

  return {
    id: row.id,
    name: row.name,
    memberCount: row.memberCount,
    createdAt: row.createdAt.toISOString()
  }
})
