// POST /api/import/preview — {source, csv} → dry-run ImportPreview.
// Nothing is written; counts what would be created vs matched by lowercase name.
import { z } from 'zod'
import type { ImportPreview } from '#shared/types/import'
import {
  buildPreview,
  IMPORT_MAX_BYTES,
  loadExistingCatalog,
  runMapper
} from '../../utils/import/plan'

const bodySchema = z.object({
  source: z.enum(['toggl', 'clockify', 'generic']),
  csv: z.string().min(1)
})

export default defineEventHandler(async (event): Promise<ImportPreview> => {
  const user = await requireAuth(event)
  const body = await readValidatedBody(event, b => bodySchema.parse(b))
  if (body.csv.length > IMPORT_MAX_BYTES) {
    throw createError({ statusCode: 413, message: 'CSV exceeds the 5MB import limit' })
  }

  const result = runMapper(body.source, body.csv)
  const existing = await loadExistingCatalog(useDrizzle(), user.orgId)
  return buildPreview(body.source, result, existing)
})
