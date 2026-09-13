// DELETE /api/invites/:id — revoke a pending invite (owner/admin only).
import { z } from 'zod'

export default defineEventHandler(async (event) => {
  demoGuard(event) // 403 in demo mode
  const user = await requireAuth(event)
  if (user.role !== 'owner' && user.role !== 'admin') {
    throw createError({ statusCode: 403, message: 'Only owners and admins can revoke invites.' })
  }
  const id = z.uuid().parse(getRouterParam(event, 'id'))

  const rows = await useDrizzle()
    .delete(schema.invites)
    .where(and(eq(schema.invites.id, id), eq(schema.invites.orgId, user.orgId)))
    .returning({ id: schema.invites.id })
  if (!rows.length) throw createError({ statusCode: 404, message: 'Invite not found' })

  return { ok: true }
})
