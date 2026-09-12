// POST /api/timer/start — insert a running entry. Stops nothing: a second
// start trips the partial unique index (one running row per user) → 409.
import { z } from 'zod'

const bodySchema = z
  .object({
    name: z.string().trim().max(500).default(''),
    refType: z.enum(['client', 'project', 'task']).nullish(),
    refId: z.uuid().nullish(),
    billable: z.boolean().optional()
  })
  .refine(b => (b.refType != null) === (b.refId != null), {
    message: 'refType and refId go together'
  })

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } }
  return e?.code === '23505' || e?.cause?.code === '23505'
}

export default defineEventHandler(async (event): Promise<TimerState> => {
  const user = await requireAuth(event)
  const body = await readValidatedBody(event, b => bodySchema.parse(b))
  const db = useDrizzle()
  const ctx = await loadRateContext(db, user.orgId)

  const chain = walkChain(body.refType, body.refId, ctx)
  if (body.refType && body.refId && !chain) {
    throw createError({ statusCode: 400, message: `Unknown ${body.refType}` })
  }

  // billable defaults from project.billable_default when resolvable, else true (Rule 2).
  const billable = body.billable ?? (chain ? chain.billableDefault : true)

  try {
    const [row] = await db
      .insert(schema.timeEntries)
      .values({
        orgId: user.orgId,
        userId: user.id,
        name: body.name,
        refType: body.refType ?? null,
        refId: body.refId ?? null,
        billable,
        start: new Date()
      })
      .returning()
    return toTimerState(row!, ctx)
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw createError({ statusCode: 409, message: 'A timer is already running.' })
    }
    throw err
  }
})
