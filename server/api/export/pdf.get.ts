// GET /api/export/pdf?from&to&billable&groupBy — the current report as a real
// application/pdf attachment. Same query shape and aggregation as
// GET /api/summary/reports (buildReportSummary), plus fan-out-safe per-day
// totals for the hours-by-day table; rendering is pure pdf-lib
// (server/utils/pdf/render-report.ts).
import {
  buildReportDayTotals,
  buildReportSummary,
  reportQuerySchema
} from '../../utils/pdf/report-data'
import { renderReportPdf } from '../../utils/pdf/render-report'

const pad = (n: number) => String(n).padStart(2, '0')
const fmtDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const params = getSanitizedQuery(event, reportQuerySchema)
  const db = useDrizzle()

  const [summary, dayTotals] = await Promise.all([
    buildReportSummary(db, user.orgId, params),
    buildReportDayTotals(db, user.orgId, params)
  ])

  const lastDay = new Date(params.to.getTime() - 1)
  const bytes = await renderReportPdf(summary, {
    orgName: user.orgName,
    from: params.from,
    lastDay,
    billable: params.billable,
    groupBy: params.groupBy,
    dayTotals
  })

  const filename = `tick-report-${fmtDay(params.from)}_${fmtDay(lastDay)}.pdf`
  setHeader(event, 'Content-Type', 'application/pdf')
  setHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)
  setHeader(event, 'Content-Length', bytes.byteLength)
  return Buffer.from(bytes)
})
