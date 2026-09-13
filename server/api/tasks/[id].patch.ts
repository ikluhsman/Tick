// PATCH /api/tasks/:id — partial edit (projectId: null detaches; done toggles) → TaskDto.
import { z } from 'zod'

const bodySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  projectId: z.uuid().nullish(),
  rate: z.number().nonnegative().nullish(),
  estimateMinutes: z.number().int().positive().nullish(),
  done: z.boolean().optional()
})

export default defineEventHandler(async (event): Promise<TaskDto> => {
  const user = await requireAuth(event)
  const id = uuidRouterParam(event, 'id')
  const body = await readSanitizedBody(event, bodySchema)
  const db = useDrizzle()

  if (typeof body.projectId === 'string') {
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

  const patch: Partial<typeof schema.tasks.$inferInsert> = {}
  if (body.name !== undefined) patch.name = body.name
  if (body.projectId !== undefined) patch.projectId = body.projectId
  if (body.rate !== undefined) patch.rate = body.rate
  if (body.estimateMinutes !== undefined) patch.estimateMinutes = body.estimateMinutes
  if (body.done !== undefined) patch.done = body.done

  const where = and(
    eq(schema.tasks.id, id),
    eq(schema.tasks.orgId, user.orgId),
    isNull(schema.tasks.deletedAt)
  )
  const rows = Object.keys(patch).length
    ? await db.update(schema.tasks).set(patch).where(where).returning({ id: schema.tasks.id })
    : await db.select({ id: schema.tasks.id }).from(schema.tasks).where(where)
  if (!rows.length) throw createError({ statusCode: 404, message: 'Task not found' })

  const ctx = await loadRateContext(db, user.orgId)
  const agg = await loadOrgAggregates(db, user.orgId, ctx)
  const dto = buildTaskDtos(ctx, agg, user.id).find(t => t.id === id)
  if (!dto) throw createError({ statusCode: 404, message: 'Task not found' })
  return dto
})
