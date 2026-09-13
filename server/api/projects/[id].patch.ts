// PATCH /api/projects/:id — partial edit (clientId: null detaches) → ProjectDto.
import { z } from 'zod'

const bodySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  clientId: z.uuid().nullish(),
  rate: z.number().nonnegative().nullish(),
  billableDefault: z.boolean().optional(),
  estimateMinutes: z.number().int().positive().nullish(),
  visibility: z.enum(['private', 'public']).optional(),
  archived: z.boolean().optional()
})

export default defineEventHandler(async (event): Promise<ProjectDto> => {
  const user = await requireAuth(event)
  const id = uuidRouterParam(event, 'id')
  const body = await readSanitizedBody(event, bodySchema)
  const db = useDrizzle()

  if (typeof body.clientId === 'string') {
    const [client] = await db
      .select({ id: schema.clients.id })
      .from(schema.clients)
      .where(
        and(
          eq(schema.clients.id, body.clientId),
          eq(schema.clients.orgId, user.orgId),
          isNull(schema.clients.deletedAt)
        )
      )
      .limit(1)
    if (!client) throw createError({ statusCode: 400, message: 'Unknown client' })
  }

  const patch: Partial<typeof schema.projects.$inferInsert> = {}
  if (body.name !== undefined) patch.name = body.name
  if (body.clientId !== undefined) patch.clientId = body.clientId
  if (body.rate !== undefined) patch.rate = body.rate
  if (body.billableDefault !== undefined) patch.billableDefault = body.billableDefault
  if (body.estimateMinutes !== undefined) patch.estimateMinutes = body.estimateMinutes
  if (body.visibility !== undefined) patch.visibility = body.visibility
  if (body.archived !== undefined) patch.archived = body.archived

  const where = and(
    eq(schema.projects.id, id),
    eq(schema.projects.orgId, user.orgId),
    isNull(schema.projects.deletedAt)
  )
  const rows = Object.keys(patch).length
    ? await db.update(schema.projects).set(patch).where(where).returning({ id: schema.projects.id })
    : await db.select({ id: schema.projects.id }).from(schema.projects).where(where)
  if (!rows.length) throw createError({ statusCode: 404, message: 'Project not found' })

  const ctx = await loadRateContext(db, user.orgId)
  const agg = await loadOrgAggregates(db, user.orgId, ctx)
  const dto = buildProjectDtos(ctx, agg, user.id).find(p => p.id === id)
  if (!dto) throw createError({ statusCode: 404, message: 'Project not found' })
  return dto
})
