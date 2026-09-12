// Reports DTOs — GET /api/summary/reports (aggregation) + the reports store.
// Server resolves chains/rates (Rules 1–2) and assigns series colors by rank;
// clients only paint. Colors are semantic tokens ('primary', 'secondary-600', …).

export type ReportRange = 'week' | 'lastweek' | 'month' | 'custom'
export type ReportBillFilter = 'all' | 'billable' | 'nonbillable'
export type ReportGroupBy = 'client' | 'project' | 'task' | 'tag'

export interface ReportDaySegment {
  /** Group key this slice belongs to (matches ReportGroup.key) */
  key: string
  label: string
  sec: number
}

export interface ReportDay {
  /** Local calendar day, YYYY-MM-DD */
  date: string
  totalSec: number
  /** Largest first — stack renders bottom-up in this order */
  segments: ReportDaySegment[]
}

export interface ReportGroup {
  key: string
  /** "Northwind Legal", "No client", "#meeting", "Untagged", … */
  label: string
  /** Parent in the chain (project → client, task → project); null for top level / buckets */
  sub: string | null
  /** Series token by rank: 'primary' | 'secondary-600' | 'neutral-400' | 'primary-800' | 'neutral-600' */
  color: string
  entries: number
  sec: number
  billableSec: number
  amount: number
  /** Share of total tracked seconds, 0–100 */
  sharePct: number
}

export interface ReportTotals {
  entries: number
  sec: number
  billableSec: number
  amount: number
  /** Days in range with any tracked time */
  workedDays: number
  /** amount / billable hours, null when nothing billable */
  avgRate: number | null
}

export interface ReportSummary {
  days: ReportDay[]
  groups: ReportGroup[]
  totals: ReportTotals
}
