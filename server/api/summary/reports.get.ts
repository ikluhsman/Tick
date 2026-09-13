// GET /api/summary/reports?from&to&billable&groupBy — ReportSummary for the org.
// Aggregation lives in server/utils/pdf/report-data.ts (buildReportSummary),
// shared byte-for-byte with GET /api/export/pdf. This route only validates the
// query and guards the session.
import type { ReportSummary } from '#shared/types/reports'
import { buildReportSummary, reportQuerySchema } from '../../utils/pdf/report-data'

export default defineEventHandler(async (event): Promise<ReportSummary> => {
  const user = await requireAuth(event)
  const params = getSanitizedQuery(event, reportQuerySchema)
  return buildReportSummary(useDrizzle(), user.orgId, params)
})
