// POST /api/entries/bulk — {ids, action:'delete'|'billable'|'restore'|'reassign', billable?, refType?, refId?}.
// delete → DeleteResult (undo snapshot); billable/restore → { count };
// reassign → EntryDto[] (deepest ref only per Rule 1; null refType clears).
import { z } from 'zod'

const bodySchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(500),
    action: z.enum(['delete', 'billable', 'restore', 'reassign']),
    billable: z.boolean().optional(),
    refType: z.enum(['client', 'project', 'task']).nullish(),
    refId: z.uuid().nullish()
  })
  .refine(b => b.action !== 'reassign' || (b.refType == null) === (b.refId == null), {
    message: 'refType and refId must be provided together'
  })

export default defineEventHandler(
  async (event): Promise<DeleteResult | { count: number } | EntryDto[]> => {
    const user = await requireAuth(event)
    const body = await readValidatedBody(event, b => bodySchema.parse(b))
    const db = useDrizzle()

    const own = and(
      eq(schema.timeEntries.orgId, user.orgId),
      eq(schema.timeEntries.userId, user.id),
      inArray(schema.timeEntries.id, body.ids)
    )

    if (body.action === 'delete') {
      const rows = await db
        .update(schema.timeEntries)
        .set({ deletedAt: new Date() })
        .where(and(own, isNull(schema.timeEntries.deletedAt), isNotNull(schema.timeEntries.end)))
        .returning({ id: schema.timeEntries.id })
      return {
        deleted: { clients: [], projects: [], tasks: [], entries: rows.map(r => r.id) },
        detached: { projects: 0, tasks: 0, entries: 0 }
      }
    }

    if (body.action === 'billable') {
      if (body.billable === undefined) {
        throw createError({ statusCode: 400, message: 'billable is required for this action' })
      }
      const rows = await db
        .update(schema.timeEntries)
        .set({ billable: body.billable })
        .where(and(own, isNull(schema.timeEntries.deletedAt)))
        .returning({ id: schema.timeEntries.id })
      return { count: rows.length }
    }

    if (body.action === 'reassign') {
      const ctx = await loadRateContext(db, user.orgId)
      let refType: RefType | null = null
      let refId: string | null = null
      if (body.refType != null && body.refId != null) {
        // Ref must resolve inside the session org's live catalog (ctx is org-scoped)
        if (!walkChain(body.refType, body.refId, ctx)) {
          throw createError({ statusCode: 400, message: `Unknown ${body.refType}` })
        }
        refType = body.refType
        refId = body.refId
      }
      const rows = await db
        .update(schema.timeEntries)
        .set({ refType, refId })
        .where(and(own, isNull(schema.timeEntries.deletedAt), isNotNull(schema.timeEntries.end)))
        .returning()
      const tagMap = await fetchTagsForEntries(db, rows.map(r => r.id))
      return rows.map(r => toEntryDto(r, ctx, tagMap.get(r.id) ?? []))
    }

    // restore
    const rows = await db
      .update(schema.timeEntries)
      .set({ deletedAt: null })
      .where(and(own, isNotNull(schema.timeEntries.deletedAt)))
      .returning({ id: schema.timeEntries.id })
    return { count: rows.length }
  }
)
