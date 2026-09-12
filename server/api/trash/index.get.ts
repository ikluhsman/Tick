// GET /api/trash — soft-deleted rows grouped by entity, 30-day countdown.
// Anything older than 30 days is hard-purged here first (Rule 3/4), entries
// before catalog rows for FK safety.
import type { TrashDto, TrashItemDto } from '~~/shared/types/settings'

const RETENTION_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

export default defineEventHandler(async (event): Promise<TrashDto> => {
  const user = await requireAuth(event)
  const db = useDrizzle()
  const cutoff = new Date(Date.now() - RETENTION_DAYS * DAY_MS)

  // Auto-purge anything past retention.
  await db.transaction(async (tx) => {
    const expired = (table: typeof schema.timeEntries | typeof schema.tasks | typeof schema.projects | typeof schema.clients | typeof schema.tags) =>
      and(eq(table.orgId, user.orgId), isNotNull(table.deletedAt), lt(table.deletedAt, cutoff))
    await tx.delete(schema.timeEntries).where(expired(schema.timeEntries))
    await tx.delete(schema.tasks).where(expired(schema.tasks))
    await tx.delete(schema.projects).where(expired(schema.projects))
    await tx.delete(schema.clients).where(expired(schema.clients))
    await tx.delete(schema.tags).where(expired(schema.tags))
  })

  const toItem = (r: { id: string, name: string, deletedAt: Date | null }): TrashItemDto => {
    const deletedAt = r.deletedAt!
    const daysLeft = Math.max(
      0,
      Math.floor((deletedAt.getTime() + RETENTION_DAYS * DAY_MS - Date.now()) / DAY_MS)
    )
    return { id: r.id, name: r.name, deletedAt: deletedAt.toISOString(), daysLeft }
  }

  const trashed = async (
    table: typeof schema.clients | typeof schema.projects | typeof schema.tasks | typeof schema.tags | typeof schema.timeEntries
  ) =>
    (
      await db
        .select({ id: table.id, name: table.name, deletedAt: table.deletedAt })
        .from(table)
        .where(and(eq(table.orgId, user.orgId), isNotNull(table.deletedAt)))
        .orderBy(desc(table.deletedAt))
    ).map(toItem)

  return {
    clients: await trashed(schema.clients),
    projects: await trashed(schema.projects),
    tasks: await trashed(schema.tasks),
    tags: await trashed(schema.tags),
    entries: await trashed(schema.timeEntries)
  }
})
