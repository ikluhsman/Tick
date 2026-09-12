// POST /api/timer/stop — end the running entry. <1s elapsed = accidental tap:
// the row is discarded (hard delete) and null returned.
//
// The host wall clock (notably under WSL) can step backwards — and Postgres'
// now() follows the same clock, so no wall clock (JS Date OR DB) can be
// trusted for elapsed time. Primary source of truth: the monotonic mark
// start.post.ts left in monoStarts (performance.now() never steps). When the
// mark is gone (server restarted mid-run) we fall back to DB-clock SQL, and
// in both paths the persisted end is computed IN SQL with a GREATEST floor —
// a negative/backwards duration can never persist.
const monoStarts: Map<string, number> =
  ((globalThis as Record<string, unknown> & { __tickTimerMonoStarts?: Map<string, number> })
    .__tickTimerMonoStarts ??= new Map())

export default defineEventHandler(async (event): Promise<EntryDto | null> => {
  const user = await requireAuth(event)
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

  const monoMark = monoStarts.get(running.id)
  monoStarts.delete(running.id)

  if (monoMark === undefined) {
    // Fallback (server restarted while the timer ran): DB-clock math only.
    // Discard iff now() - start is in [0s, 1s), evaluated in SQL — a
    // backwards-stepped clock (negative elapsed) keeps the entry.
    const discarded = await db
      .delete(schema.timeEntries)
      .where(
        and(
          eq(schema.timeEntries.id, running.id),
          sql`now() - ${schema.timeEntries.start} >= interval '0 seconds'`,
          sql`now() - ${schema.timeEntries.start} < interval '1 second'`
        )
      )
      .returning({ id: schema.timeEntries.id })
    if (discarded.length) return null
  } else if (performance.now() - monoMark < 1000) {
    // Monotonic elapsed < 1s → genuine accidental tap, regardless of what
    // any wall clock claims. Hard delete.
    await db.delete(schema.timeEntries).where(eq(schema.timeEntries.id, running.id))
    return null
  }

  // end = GREATEST(now(), start + max(1s, monotonic elapsed)): even if the
  // wall clock stepped back past the start, the persisted duration is ≥ the
  // true (monotonic) elapsed time and ≥1s — never negative or shortened.
  const elapsedSec = monoMark === undefined ? 1 : Math.max(1, (performance.now() - monoMark) / 1000)
  const [row] = await db
    .update(schema.timeEntries)
    .set({
      end: sql`GREATEST(now(), ${schema.timeEntries.start} + make_interval(secs => ${elapsedSec}))`
    })
    .where(eq(schema.timeEntries.id, running.id))
    .returning()
  const ctx = await loadRateContext(db, user.orgId)
  const tags = await fetchTagsForEntries(db, [row!.id])
  return toEntryDto(row!, ctx, tags.get(row!.id) ?? [])
})
