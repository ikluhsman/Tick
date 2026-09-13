// GET /api/export/csv?from&to&billable — the org's entries in [from, to) as a
// text/csv attachment. Chain + rate resolve through the same helpers as the
// entries API (Rules 1–2); trashed rows and the running timer are excluded.
// Columns: date,start,end,duration_h,name,task,project,client,tags,billable,rate,amount
import { z } from 'zod'

const isoDate = z
  .string()
  .transform(s => new Date(s))
  .refine(d => Number.isFinite(d.getTime()), { message: 'Invalid date' })

const querySchema = z.object({
  from: isoDate,
  to: isoDate,
  billable: z.enum(['all', 'billable', 'nonbillable']).default('all')
})

const pad = (n: number) => String(n).padStart(2, '0')
const fmtDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/**
 * RFC 4180 escaping: quote when the field holds a comma, quote or newline;
 * double inner quotes. Text fields starting with = + - @ tab or CR are
 * spreadsheet formula injection vectors (Excel/Sheets evaluate them on open,
 * e.g. =HYPERLINK/DDE) — neutralize with a leading apostrophe and force
 * quoting. Numeric/boolean fields are never neutralized.
 */
function csvField(v: string | number | boolean | null): string {
  const s = v == null ? '' : String(v)
  const formulaRisk = typeof v === 'string' && /^[=+\-@\t\r]/.test(s)
  const out = formulaRisk ? `'${s}` : s
  return formulaRisk || /[",\n\r]/.test(out) ? `"${out.replace(/"/g, '""')}"` : out
}

export default defineEventHandler(async (event): Promise<string> => {
  const user = await requireAuth(event)
  const { from, to, billable } = getSanitizedQuery(event, querySchema)
  const db = useDrizzle()

  const e = schema.timeEntries
  const conds = [
    eq(e.orgId, user.orgId),
    isNull(e.deletedAt),
    isNotNull(e.end),
    gte(e.start, from),
    lt(e.start, to)
  ]
  if (billable === 'billable') conds.push(eq(e.billable, true))
  if (billable === 'nonbillable') conds.push(eq(e.billable, false))

  const rows = await db.select().from(e).where(and(...conds)).orderBy(asc(e.start))

  const ctx = await loadRateContext(db, user.orgId)
  const tagMap = await fetchTagsForEntries(db, rows.map(r => r.id))

  const header = 'date,start,end,duration_h,name,task,project,client,tags,billable,rate,amount'
  const lines = rows.map((row) => {
    const dto = toEntryDto(row, ctx, tagMap.get(row.id) ?? [])
    return [
      fmtDay(row.start),
      fmtTime(row.start),
      fmtTime(row.end!),
      (dto.durationSec / 3600).toFixed(2),
      dto.name,
      dto.ref?.taskName ?? '',
      dto.ref?.projectName ?? '',
      dto.ref?.clientName ?? '',
      dto.tags.join(', '),
      dto.billable,
      dto.resolvedRate ?? '',
      dto.amount != null ? dto.amount.toFixed(2) : ''
    ].map(csvField).join(',')
  })

  const filename = `tick-export-${fmtDay(from)}--${fmtDay(new Date(to.getTime() - 1))}.csv`
  setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)
  return [header, ...lines].join('\r\n') + '\r\n'
})
