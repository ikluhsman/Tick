// GET /api/invites/lookup/:token — public lookup for the register page
// (?invite=TOKEN prefill). 404 unknown, 410 expired or already used.
import { z } from 'zod'
import type { InviteLookupDto } from '~~/shared/types/settings'

export default defineEventHandler(async (event): Promise<InviteLookupDto> => {
  const token = z.string().min(1).max(200).parse(getRouterParam(event, 'token'))
  const db = useDrizzle()

  const [row] = await db
    .select({
      email: schema.invites.email,
      role: schema.invites.role,
      expiresAt: schema.invites.expiresAt,
      acceptedAt: schema.invites.acceptedAt,
      orgName: schema.orgs.name
    })
    .from(schema.invites)
    .innerJoin(schema.orgs, eq(schema.orgs.id, schema.invites.orgId))
    .where(eq(schema.invites.token, token))
    .limit(1)
  if (!row) throw createError({ statusCode: 404, message: 'Invite not found' })
  if (row.acceptedAt || row.expiresAt.getTime() < Date.now()) {
    throw createError({ statusCode: 410, message: 'This invite has expired or was already used.' })
  }

  return { email: row.email, role: row.role as InviteLookupDto['role'], orgName: row.orgName }
})
