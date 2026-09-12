// POST /api/entries — manual entry. start < end enforced; tags created on the fly.
import { z } from 'zod'

const isoDate = z
  .string()
  .transform(s => new Date(s))
  .refine(d => Number.isFinite(d.getTime()), { message: 'Invalid date' })

const bodySchema = z
  .object({
    name: z.string().trim().max(500).default(''),
    refType: z.enum(['client', 'project', 'task']).nullish(),
    refId: z.uuid().nullish(),
    billable: z.boolean().optional(),
    rateOverride: z.number().nonnegative().nullish(),
    start: isoDate,
    end: isoDate,
    tags: z.array(z.string()).max(50).default([])
  })
  .refine(b => (b.refType != null) === (b.refId != null), {
    message: 'refType and refId go together'
  })
  .refine(b => b.start.getTime() < b.end.getTime(), { message: 'start must be before end' })

export default defineEventHandler(async (event): Promise<EntryDto> => {
  const user = await requireAuth(event)
  const body = await readValidatedBody(event, b => bodySchema.parse(b))
  const db = useDrizzle()
  const ctx = await loadRateContext(db, user.orgId)

  const chain = walkChain(body.refType, body.refId, ctx)
  if (body.refType && body.refId && !chain) {
    throw createError({ statusCode: 400, message: `Unknown ${body.refType}` })
  }
  const billable = body.billable ?? (chain ? chain.billableDefault : true)

  const [row] = await db
    .insert(schema.timeEntries)
    .values({
      orgId: user.orgId,
      userId: user.id,
      name: body.name,
      refType: body.refType ?? null,
      refId: body.refId ?? null,
      billable,
      rateOverride: body.rateOverride ?? null,
      start: body.start,
      end: body.end
    })
    .returning()

  const tagRows = await ensureTags(db, user.orgId, body.tags)
  await setEntryTags(db, row!.id, tagRows.map(t => t.id))
  return toEntryDto(row!, ctx, tagRows.map(t => t.name).sort())
})
