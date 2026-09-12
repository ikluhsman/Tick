// Reports store — range / billable filter / grouping + the fetched summary.
// All aggregation happens server-side (GET /api/summary/reports); this store
// only owns the controls' state and the [from, to) window they resolve to.
import type {
  ReportBillFilter,
  ReportGroupBy,
  ReportRange,
  ReportSummary
} from '#shared/types/reports'

/** Series token → paintable CSS. Tokens come ranked from the server (chart + table chips share them). */
export function reportSeriesColor(token: string): string {
  return token === 'primary' ? 'var(--ui-primary)' : `var(--ui-color-${token})`
}

const DAY_MS = 86_400_000

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
/** Monday 00:00 of the week containing d (local). */
const startOfWeek = (d: Date) => {
  const x = startOfDay(d)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}
const fmtShort = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export const useReportsStore = defineStore('reports', () => {
  // SSR-safe fetch: forwards the request's cookies during server render;
  // plain $fetch on the client.
  const requestFetch = useRequestFetch()

  const range = ref<ReportRange>('week')
  /** Custom range, inclusive local days (YYYY-MM-DD); only read when range === 'custom'. */
  const customFrom = ref<string | null>(null)
  const customTo = ref<string | null>(null)
  const billable = ref<ReportBillFilter>('all')
  const groupBy = ref<ReportGroupBy>('project')

  const summary = ref<ReportSummary | null>(null)
  const pending = ref(false)
  const error = ref(false)

  const parseDay = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y!, (m ?? 1) - 1, d ?? 1)
  }

  /** [from, to) — `to` is the exclusive end (midnight after the last day). */
  const bounds = computed<{ from: Date, to: Date }>(() => {
    const now = new Date()
    const weekStart = startOfWeek(now)
    switch (range.value) {
      case 'week':
        return { from: weekStart, to: new Date(weekStart.getTime() + 7 * DAY_MS) }
      case 'lastweek':
        return { from: new Date(weekStart.getTime() - 7 * DAY_MS), to: weekStart }
      case 'month':
        return {
          from: new Date(now.getFullYear(), now.getMonth(), 1),
          to: new Date(now.getFullYear(), now.getMonth() + 1, 1)
        }
      case 'custom': {
        const from = customFrom.value ? parseDay(customFrom.value) : startOfDay(now)
        const last = customTo.value ? parseDay(customTo.value) : from
        return { from, to: new Date(last.getTime() + DAY_MS) }
      }
    }
  })

  const rangeName = computed(() =>
    range.value === 'week'
      ? 'This week'
      : range.value === 'lastweek'
        ? 'Last week'
        : range.value === 'month' ? 'This month' : 'Custom'
  )

  /** "This week · Sep 7 – Sep 13 · 11 entries" */
  const rangeLabel = computed(() => {
    const { from, to } = bounds.value
    const dates = `${fmtShort(from)} – ${fmtShort(new Date(to.getTime() - DAY_MS))}`
    const n = summary.value?.totals.entries
    return `${rangeName.value} · ${dates}${n != null ? ` · ${n} ${n === 1 ? 'entry' : 'entries'}` : ''}`
  })

  const dayCount = computed(() =>
    Math.round((bounds.value.to.getTime() - bounds.value.from.getTime()) / DAY_MS)
  )

  const csvUrl = computed(() => {
    const { from, to } = bounds.value
    const q = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
      billable: billable.value
    })
    return `/api/export/csv?${q}`
  })

  /** Server-rendered PDF of the current report (mirrors the summary query, incl. grouping). */
  const pdfUrl = computed(() => {
    const { from, to } = bounds.value
    const q = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
      billable: billable.value,
      groupBy: groupBy.value
    })
    return `/api/export/pdf?${q}`
  })

  async function fetchSummary() {
    const { from, to } = bounds.value
    pending.value = true
    error.value = false
    try {
      summary.value = await requestFetch<ReportSummary>('/api/summary/reports', {
        query: {
          from: from.toISOString(),
          to: to.toISOString(),
          billable: billable.value,
          groupBy: groupBy.value
        }
      })
    } catch {
      error.value = true
    } finally {
      pending.value = false
    }
  }

  function setRange(r: Exclude<ReportRange, 'custom'>) {
    range.value = r
    return fetchSummary()
  }

  /** Inclusive local days (YYYY-MM-DD). */
  function setCustomRange(from: string, to: string) {
    customFrom.value = from
    customTo.value = to
    range.value = 'custom'
    return fetchSummary()
  }

  function setBillable(b: ReportBillFilter) {
    billable.value = b
    return fetchSummary()
  }

  function setGroupBy(g: ReportGroupBy) {
    groupBy.value = g
    return fetchSummary()
  }

  return {
    range,
    customFrom,
    customTo,
    billable,
    groupBy,
    summary,
    pending,
    error,
    bounds,
    rangeName,
    rangeLabel,
    dayCount,
    csvUrl,
    pdfUrl,
    fetchSummary,
    setRange,
    setCustomRange,
    setBillable,
    setGroupBy
  }
})
