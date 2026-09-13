// PATCH /api/timer — edit the running entry: rename, attach/detach ref
// (refId: null detaches), toggle billable. 404 when nothing is running.
import { z } from 'zod'

const bodySchema = z
  .object({
    name: z.string().trim().max(500).optional(),
    refType: z.enum(['client', 'project', 'task']).nullish(),
    refId: z.uuid().nullish(),
    billable: z.boolean().optional()
  })
  .refine(b => !(typeof b.refId === 'string' && b.refType == null), {
    message: 'refType is required with refId'
  })

export default defineEventHandler(async (event): Promise<TimerState> => {
  const user = await requireAuth(event)
  const body = await readSanitizedBody(event, bodySchema)
  const db = useDrizzle()

  const [running] = await db
    .select()
    .from(schema.timeEntries)
    .where(
      and(
        eq(schema.timeEntries.orgId, user.orgId),
        eq(schema.timeEntries.userId, user.id),
        isNull(schema.timeEntries.end),
        isNull(schema.timeEntries.deletedAt)
      )
    )
    .limit(1)
  if (!running) throw createError({ statusCode: 404, message: 'No timer running.' })

  const ctx = await loadRateContext(db, user.orgId)
  const patch: Partial<typeof schema.timeEntries.$inferInsert> = {}

  if (body.name !== undefined) patch.name = body.name
  if (body.billable !== undefined) patch.billable = body.billable
  if (body.refId === null || body.refType === null) {
    patch.refType = null
    patch.refId = null
  } else if (typeof body.refId === 'string') {
    if (!walkChain(body.refType, body.refId, ctx)) {
      throw createError({ statusCode: 400, message: `Unknown ${body.refType}` })
    }
    patch.refType = body.refType!
    patch.refId = body.refId
  }

  if (Object.keys(patch).length === 0) return toTimerState(running, ctx)

  const [row] = await db
    .update(schema.timeEntries)
    .set(patch)
    .where(eq(schema.timeEntries.id, running.id))
    .returning()
  return toTimerState(row!, ctx)
})
