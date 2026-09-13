// PATCH /api/org — rename the org. Owner/admin only (role from session).
import { z } from 'zod'
import type { OrgInfoDto } from '~~/shared/types/settings'

const bodySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120)
})

export default defineEventHandler(async (event): Promise<OrgInfoDto> => {
  demoGuard(event) // 403 in demo mode
  const user = await requireAuth(event)
  if (user.role !== 'owner' && user.role !== 'admin') {
    throw createError({ statusCode: 403, message: 'Only owners and admins can rename the organization.' })
  }
  const body = await readSanitizedBody(event, bodySchema)
  const db = useDrizzle()

  const [org] = await db
    .update(schema.orgs)
    .set({ name: body.name })
    .where(eq(schema.orgs.id, user.orgId))
    .returning()
  if (!org) throw createError({ statusCode: 404, message: 'Organization not found' })

  const [members] = await db
    .select({ n: count() })
    .from(schema.orgMembers)
    .where(eq(schema.orgMembers.orgId, user.orgId))

  // Keep the session's orgName in step (sidebar org switcher).
  await setUserSession(event, { user: { ...user, orgName: org.name } })

  return {
    id: org.id,
    name: org.name,
    memberCount: members?.n ?? 1,
    createdAt: org.createdAt.toISOString()
  }
})
