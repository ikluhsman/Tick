// POST /api/projects — create → ProjectDto.
import { z } from 'zod'

const bodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  clientId: z.uuid().nullish(),
  rate: z.number().nonnegative().nullish(),
  billableDefault: z.boolean().default(true),
  estimateMinutes: z.number().int().positive().nullish(),
  visibility: z.enum(['private', 'public']).default('private')
})

export default defineEventHandler(async (event): Promise<ProjectDto> => {
  const user = await requireAuth(event)
  const body = await readSanitizedBody(event, bodySchema)
  const db = useDrizzle()

  if (body.clientId) {
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

  const [row] = await db
    .insert(schema.projects)
    .values({
      orgId: user.orgId,
      name: body.name,
      clientId: body.clientId ?? null,
      rate: body.rate ?? null,
      billableDefault: body.billableDefault,
      estimateMinutes: body.estimateMinutes ?? null,
      visibility: body.visibility
    })
    .returning()

  const ctx = await loadRateContext(db, user.orgId)
  const agg = await loadOrgAggregates(db, user.orgId, ctx)
  const dto = buildProjectDtos(ctx, agg, user.id).find(p => p.id === row!.id)
  if (!dto) throw createError({ statusCode: 500, message: 'Project creation failed' })
  return dto
})
