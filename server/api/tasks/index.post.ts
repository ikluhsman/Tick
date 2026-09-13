// POST /api/tasks — create → TaskDto.
import { z } from 'zod'

const bodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  projectId: z.uuid().nullish(),
  rate: z.number().nonnegative().nullish(),
  estimateMinutes: z.number().int().positive().nullish(),
  done: z.boolean().default(false)
})

export default defineEventHandler(async (event): Promise<TaskDto> => {
  const user = await requireAuth(event)
  const body = await readSanitizedBody(event, bodySchema)
  const db = useDrizzle()

  if (body.projectId) {
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, body.projectId),
          eq(schema.projects.orgId, user.orgId),
          isNull(schema.projects.deletedAt)
        )
      )
      .limit(1)
    if (!project) throw createError({ statusCode: 400, message: 'Unknown project' })
  }

  const [row] = await db
    .insert(schema.tasks)
    .values({
      orgId: user.orgId,
      name: body.name,
      projectId: body.projectId ?? null,
      rate: body.rate ?? null,
      estimateMinutes: body.estimateMinutes ?? null,
      done: body.done
    })
    .returning()

  const ctx = await loadRateContext(db, user.orgId)
  const agg = await loadOrgAggregates(db, user.orgId, ctx)
  const dto = buildTaskDtos(ctx, agg, user.id).find(t => t.id === row!.id)
  if (!dto) throw createError({ statusCode: 500, message: 'Task creation failed' })
  return dto
})
