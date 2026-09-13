// PATCH /api/clients/:id — {name?, rate?|null} → ClientDto.
import { z } from 'zod'

const bodySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  rate: z.number().nonnegative().nullish()
})

export default defineEventHandler(async (event): Promise<ClientDto> => {
  const user = await requireAuth(event)
  const id = uuidRouterParam(event, 'id')
  const body = await readSanitizedBody(event, bodySchema)
  const db = useDrizzle()

  const patch: Partial<typeof schema.clients.$inferInsert> = {}
  if (body.name !== undefined) patch.name = body.name
  if (body.rate !== undefined) patch.rate = body.rate

  const rows = Object.keys(patch).length
    ? await db
        .update(schema.clients)
        .set(patch)
        .where(
          and(
            eq(schema.clients.id, id),
            eq(schema.clients.orgId, user.orgId),
            isNull(schema.clients.deletedAt)
          )
        )
        .returning({ id: schema.clients.id })
    : await db
        .select({ id: schema.clients.id })
        .from(schema.clients)
        .where(
          and(
            eq(schema.clients.id, id),
            eq(schema.clients.orgId, user.orgId),
            isNull(schema.clients.deletedAt)
          )
        )
  if (!rows.length) throw createError({ statusCode: 404, message: 'Client not found' })

  const ctx = await loadRateContext(db, user.orgId)
  const agg = await loadOrgAggregates(db, user.orgId, ctx)
  const dto = buildClientDtos(ctx, agg).find(c => c.id === id)
  if (!dto) throw createError({ statusCode: 404, message: 'Client not found' })
  return dto
})
